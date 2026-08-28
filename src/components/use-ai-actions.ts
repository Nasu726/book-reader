"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AiActionError,
  describeUserTurn,
  runAiAction,
  type AiAction,
} from "@/core/ai/action-service";
import type { DocumentSelection } from "@/core/selection/capture";
import type { AiProvider, AiRequest, AiResponse } from "@/core/ai/provider";
import { readAnswerLanguage, writeAnswerLanguage } from "./reader-preferences";

/** One side of one exchange, in the order it was said. */
export type ConversationTurn = {
  role: "user" | "assistant";
  text: string;
  /** The passage the turn was about, quoted back under it. */
  selectedText?: string;
};

function createFetchProvider(request: {
  action: AiAction;
  documentId?: string;
  question?: string;
  selection: DocumentSelection | null;
  targetLanguage: string;
}): AiProvider {
  return {
    async generate(outgoing: AiRequest) {
      const response = await fetch("/api/ai/action", {
        body: JSON.stringify({
          // The action and the question are what gets kept as the reader's side
          // of the conversation. The prompt goes to the provider only.
          action: request.action,
          context: outgoing.context,
          documentId: request.documentId,
          location: request.selection?.location,
          prompt: outgoing.prompt,
          question: request.question,
          selectedText: request.selection?.text,
          targetLanguage: request.targetLanguage,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: outgoing.signal,
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
 * The conversation about one document: what has been said, and how to say more.
 *
 * Held above the panel so that the menu which appears against the selection can
 * start an exchange from its own click handler. Passing the request down as a
 * prop and reacting to it in an effect meant a user event arriving as a state
 * change — which React rightly complains about, and which made the same action
 * twice in a row indistinguishable from no action at all.
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [language, setLanguageState] = useState<string>(readAnswerLanguage);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * The passage the conversation is about: whatever is selected in the book.
   *
   * Reported only by the book itself, never by the pane beside it. That is the
   * whole trick — clicking an action used to count as "nothing is selected any
   * more" and disabled every action, while letting go of a passage in the text
   * left it attached here with no way to see it or drop it.
   */
  const subject = selection;

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
          messages?: { role: string; content: string; selectedText?: string }[];
        };
        if (cancelled || !payload.messages) return;
        setTurns(payload.messages.map((message) => ({
          role: message.role === "user" ? "user" : "assistant",
          selectedText: message.selectedText,
          text: message.content,
        })));
      } catch {
        // An unreadable history leaves the panel empty, which is recoverable.
      }
    }
    void loadHistory();
    return () => { cancelled = true; };
  }, [documentId]);

  const send = useCallback(async (nextAction: AiAction, followUp?: string) => {
    const asked = nextAction === "ask" ? (followUp ?? question).trim() : undefined;
    if (nextAction === "ask" && !asked) return;

    setLoading(true);
    setError(null);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const said = describeUserTurn({
      action: nextAction,
      question: asked,
      targetLanguage: language,
    });
    // On screen before the answer, so the transcript reads in the order it
    // happened rather than jumping backwards when the reply lands.
    setTurns((current) => [...current, {
      role: "user",
      selectedText: subject?.text,
      text: said,
    }]);

    try {
      const response = await runAiAction(
        provider ?? createFetchProvider({
          action: nextAction,
          documentId,
          question: asked,
          selection: subject,
          targetLanguage: language,
        }),
        {
          action: nextAction,
          documentTitle: subject?.documentTitle,
          paperStructure: subject?.paperStructure,
          surroundingText: subject?.surroundingText,
          selectedText: subject?.text ?? "",
          // Left unstated so nothing is assumed about what is being read.
          sourceLanguage: "auto",
          targetLanguage: language,
          // One preference drives both: the language to read an answer in is
          // the language to translate into.
          responseLanguage: language,
          userQuestion: asked,
        },
      );
      setTurns((current) => [...current, { role: "assistant", text: response }]);
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
  }, [documentId, language, provider, question, subject]);

  const clear = useCallback(async () => {
    if (!documentId) return;
    setTurns([]);
    setError(null);
    try {
      await fetch(`/api/ai/action?documentId=${encodeURIComponent(documentId)}`, {
        method: "DELETE",
      });
    } catch {
      // The transcript is already empty on screen; the next open will show
      // whatever the server still holds rather than pretending otherwise.
    }
  }, [documentId]);

  const setLanguage = useCallback((next: string) => {
    setLanguageState(next);
    writeAnswerLanguage(next);
  }, []);

  const cancel = useCallback(() => abortControllerRef.current?.abort(), []);

  return {
    cancel,
    clear,
    error,
    language,
    loading,
    question,
    send,
    setLanguage,
    setQuestion,
    subject,
    turns,
  };
}
