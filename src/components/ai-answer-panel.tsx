"use client";

import { useState } from "react";

import {
  AI_ACTIONS,
  AiActionError,
  runAiAction,
  type AiAction,
} from "@/core/ai/action-service";
import type { DocumentSelection } from "@/core/selection/capture";
import type { AiProvider, AiRequest, AiResponse } from "@/core/ai/provider";

type AiAnswerPanelProps = {
  provider?: AiProvider;
  selection: DocumentSelection | null;
};

const fetchProvider: AiProvider = {
  async generate(request: AiRequest): Promise<AiResponse> {
    const response = await fetch("/api/ai/action", {
      body: JSON.stringify({ prompt: request.prompt, context: request.context }),
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

const ACTION_LABELS: Record<(typeof AI_ACTIONS)[number], string> = {
  ask: "Ask",
  explain: "Explain",
  highlight: "Highlight",
  simplify: "Simplify",
  translate: "Translate",
};

export function AiAnswerPanel({ provider, selection }: AiAnswerPanelProps) {
  const [action, setAction] = useState<AiAction>("explain");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<{ action: string; text: string }[]>([]);

  async function run(nextAction: AiAction, followUp?: string) {
    setAction(nextAction);
    setLoading(true);
    setError(null);
    try {
      const response = await runAiAction(provider ?? fetchProvider, {
        action: nextAction,
        selectedText: selection?.text ?? "",
        userQuestion: nextAction === "ask" ? followUp || question : undefined,
      });
      setHistory((current) => [{ action: nextAction, text: response }, ...current]);
    } catch (cause) {
      setError(
        cause instanceof AiActionError ? cause.message : "The AI request could not be completed.",
      );
    } finally {
      setLoading(false);
    }
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
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        {loading && <p aria-live="polite" className="text-sm">Loading…</p>}
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
                <section aria-label="AI response" className="whitespace-pre-wrap" key={`${entry.action}-${index}`}>
                  {entry.text}
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
