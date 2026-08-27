"use client";

import { useEffect, useRef, useState } from "react";

import {
  AI_ACTIONS,
  AiActionError,
  runAiAction,
  type AiAction,
} from "@/core/ai/action-service";
import type { DocumentSelection } from "@/core/selection/capture";
import { AnswerText } from "./answer-text";
import type { AiProvider, AiRequest, AiResponse } from "@/core/ai/provider";

type AiAnswerPanelProps = {
  documentId?: string;
  onHighlightCreated?: (selection: DocumentSelection) => Promise<void> | void;
  provider?: AiProvider;
  selection: DocumentSelection | null;
};

function createFetchProvider(
  documentId?: string,
  selection?: DocumentSelection | null,
): AiProvider {
  return {
    async generate(request: AiRequest) {
      const response = await fetch("/api/ai/action", {
        body: JSON.stringify({
          context: request.context,
          documentId,
          location: selection?.location,
          prompt: request.prompt,
          selectedText: selection?.text,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: request.signal,
      });
      if (!response.ok) {
        throw new Error("The provider rejected the request.");
      }
      return (await response.json()) as AiResponse;
    },
  };
}

const ACTION_LABELS: Record<(typeof AI_ACTIONS)[number], string> = {
  ask: "Ask",
  explain: "Explain",
  highlight: "Highlight",
  simplify: "Simplify",
  translate: "Translate",
};

const TARGET_LANGUAGES = [
  "English",
  "French",
  "Japanese",
  "Portuguese",
  "Simplified Chinese",
  "Spanish",
] as const;

export function AiAnswerPanel({
  documentId,
  onHighlightCreated,
  provider,
  selection,
}: AiAnswerPanelProps) {
  const [action, setAction] = useState<AiAction>("explain");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<string>("Japanese");
  const [history, setHistory] = useState<{ action: string; text: string }[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    async function loadHistory() {
      try {
        const response = await fetch(`/api/ai/action?documentId=${encodeURIComponent(documentId!)}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { messages?: { role: string; content: string }[] };
        if (cancelled || !payload.messages) return;
        setHistory(payload.messages.map((message) => ({ action: message.role, text: message.content })));
      } catch {
        return;
      }
    }
    void loadHistory();
    return () => { cancelled = true; };
  }, [documentId]);

  async function run(nextAction: AiAction, followUp?: string) {
    setAction(nextAction);
    setLoading(true);
    setError(null);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    try {
      const response = await runAiAction(provider ?? createFetchProvider(documentId, selection), {
        action: nextAction,
        documentTitle: selection?.documentTitle,
        paperStructure: selection?.paperStructure,
        surroundingText: selection?.surroundingText,
        selectedText: selection?.text ?? "",
        sourceLanguage: "auto",
        targetLanguage: targetLanguage,
        userQuestion: nextAction === "ask" ? followUp || question : undefined,
      });
      setHistory((current) => [{ action: nextAction, text: response }, ...current]);
    } catch (cause) {
      if (!abortController.signal.aborted) {
        setError(
          cause instanceof AiActionError ? cause.message : "The AI request could not be completed.",
        );
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  }

  function cancel() {
    abortControllerRef.current?.abort();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-4">
      <div aria-label="AI actions" className="flex flex-wrap gap-2" role="group">
        {AI_ACTIONS.map((candidate) => (
          <button
            className={`min-h-11 rounded-lg border px-3 text-sm ${
              action === candidate
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
            disabled={loading || (candidate === "highlight" && !selection)}
            key={candidate}
            onClick={() => {
              if (candidate === "highlight") {
                if (selection) void onHighlightCreated?.(selection);
                return;
              }
              void run(candidate);
            }}
            type="button"
          >
            {ACTION_LABELS[candidate]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="shrink-0 text-sm font-medium" htmlFor="translation-target-language">Translate to</label>
        <select
          className="min-h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700"
          disabled={loading}
          id="translation-target-language"
          onChange={(event) => setTargetLanguage(event.target.value)}
          value={targetLanguage}
        >
          {TARGET_LANGUAGES.map((language) => (
            <option key={language} value={language}>{language}</option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        {loading && (
          <div className="flex items-center justify-between gap-3">
            <p aria-live="polite" className="text-sm">Loading…</p>
            <button
              className="min-h-10 shrink-0 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700"
              onClick={cancel}
              type="button"
            >
              Cancel
            </button>
          </div>
        )}
        {error && (
          <div className="space-y-3 rounded-lg border border-red-300 p-3 text-sm" role="alert">
            <p>{error}</p>
            <button className="min-h-10 rounded bg-zinc-900 px-3 font-medium text-white" onClick={() => void run(action)} type="button">
              Retry
            </button>
          </div>
        )}
        {!loading && !error && (
          history.length > 0 ? (
            <div className="space-y-4">
              {history.map((entry, index) => (
                <section aria-label="AI response" key={`${entry.action}-${index}`}>
                  <AnswerText>{entry.text}</AnswerText>
                </section>
              ))}
            </div>
          ) : (
            <p>Select text to use an AI action.</p>
          )
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const value = question.trim();
          setQuestion("");
          void run("ask", value);
        }}
        className="space-y-2"
      >
        <label className="block text-sm font-medium" htmlFor="ai-follow-up">Follow-up question</label>
        <input
          className="min-h-11 w-full rounded-lg border border-zinc-300 px-3 dark:border-zinc-700"
          id="ai-follow-up"
          onChange={(event) => setQuestion(event.target.value)}
          value={question}
        />
        <button className="min-h-11 w-full rounded-lg bg-zinc-900 px-4 font-medium text-white" disabled={loading || !question.trim()} type="submit">
          Ask
        </button>
      </form>
    </div>
  );
}
