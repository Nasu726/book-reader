"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AiActionError,
  runAiAction,
  type AiAction,
} from "@/core/ai/action-service";
import type { DocumentSelection } from "@/core/selection/capture";
import type { AiProvider, AiRequest, AiResponse } from "@/core/ai/provider";
import { readAnswerLanguage, writeAnswerLanguage } from "./reader-preferences";

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

export type AiConversation = ReturnType<typeof useAiActions>;

/**
 * The AI conversation for one document: what has been asked, what came back,
 * and how to ask for more.
 *
 * Held above the panel so that the menu which appears against the selection can
 * start an action from its own click handler. Passing the request down as a prop
 * and reacting to it in an effect meant a user event arriving as a state change
 * — which React rightly complains about, and which made the same action twice
 * in a row indistinguishable from no action at all.
 */
export function useAiActions({
  documentId,
  provider,
  selection,
}: {
  documentId?: string;
  provider?: AiProvider;
  selection: DocumentSelection | null;
}) {
  const [action, setAction] = useState<AiAction>("explain");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [language, setLanguageState] = useState<string>(readAnswerLanguage);
  const [history, setHistory] = useState<{ action: string; text: string }[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    async function loadHistory() {
      try {
        const response = await fetch(
          `/api/ai/action?documentId=${encodeURIComponent(documentId!)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const payload = await response.json() as {
          messages?: { role: string; content: string }[];
        };
        if (cancelled || !payload.messages) return;
        setHistory(payload.messages.map((message) => ({
          action: message.role,
          text: message.content,
        })));
      } catch {
        // An unreadable history leaves the panel empty, which is recoverable.
      }
    }
    void loadHistory();
    return () => { cancelled = true; };
  }, [documentId]);

  const run = useCallback(async (nextAction: AiAction, followUp?: string) => {
    setAction(nextAction);
    setLoading(true);
    setError(null);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    try {
      const response = await runAiAction(
        provider ?? createFetchProvider(documentId, selection),
        {
          action: nextAction,
          documentTitle: selection?.documentTitle,
          paperStructure: selection?.paperStructure,
          surroundingText: selection?.surroundingText,
          selectedText: selection?.text ?? "",
          // Left unstated so nothing is assumed about what is being read.
          sourceLanguage: "auto",
          targetLanguage: language,
          // One preference drives both: the language to read an answer in is
          // the language to translate into.
          responseLanguage: language,
          userQuestion: nextAction === "ask" ? followUp || question : undefined,
        },
      );
      setHistory((current) => [{ action: nextAction, text: response }, ...current]);
    } catch (cause) {
      if (!abortController.signal.aborted) {
        setError(cause instanceof AiActionError
          ? cause.message
          : "The AI request could not be completed.");
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  }, [documentId, language, provider, question, selection]);

  const setLanguage = useCallback((next: string) => {
    setLanguageState(next);
    writeAnswerLanguage(next);
  }, []);

  const cancel = useCallback(() => abortControllerRef.current?.abort(), []);

  return {
    action,
    cancel,
    error,
    history,
    language,
    loading,
    question,
    run,
    setLanguage,
    setQuestion,
  };
}
