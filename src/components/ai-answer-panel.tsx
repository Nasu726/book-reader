"use client";

import { useEffect, useRef, useState } from "react";

import { AI_ACTION_LABELS, type AiAction } from "@/core/ai/action-service";
import { AnswerText } from "./answer-text";
import type { AiConversation } from "./use-ai-actions";

/** Sent with one click, against the passage the conversation is about. */
const QUICK_ACTIONS: AiAction[] = ["explain", "simplify"];

const TARGET_LANGUAGES = [
  "Japanese",
  "English",
  "French",
  "Portuguese",
  "Simplified Chinese",
  "Spanish",
] as const;

/** The passage the last question before this one was about. */
function previousSubject(
  turns: readonly { role: string; selectedText?: string }[],
  index: number,
): string | undefined {
  for (let earlier = index - 1; earlier >= 0; earlier -= 1) {
    if (turns[earlier].role === "user") return turns[earlier].selectedText;
  }
  return undefined;
}

/** Enough of the passage to recognise it, not enough to fill the pane. */
function excerpt(text: string, limit = 90): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit - 1)}…` : collapsed;
}

/**
 * One conversation about the book, read top to bottom.
 *
 * It used to be a mode switch over a stack of separate answers: choosing
 * Translate replaced what Explain had said, the transcript came back newest
 * first, and a second input labelled "Follow-up question" sat below an action
 * called "Ask" that did the same thing. None of that read as a conversation,
 * which is what it always was.
 *
 * The passage being discussed is named at the top rather than taken from the
 * live selection, because the browser drops a selection as soon as anything
 * else is clicked — including these buttons.
 */
export function AiAnswerPanel({
  conversation,
  onSaveToNotes,
}: {
  conversation: AiConversation;
  onSaveToNotes?: (text: string) => Promise<void> | void;
}) {
  const {
    cancel, clear, error, language, loading, question,
    send, setLanguage, setQuestion, subject, turns,
  } = conversation;

  const transcriptRef = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState<number | null>(null);

  // Follow the conversation down as it grows, the way any chat does.
  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [turns.length, loading]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 pb-2 text-xs">
        <p className="min-w-0 text-zinc-600 dark:text-zinc-400">
          {subject
            ? <>About: <span className="text-zinc-900 dark:text-zinc-100">“{excerpt(subject.text)}”</span></>
            : "Select a passage in the book to talk about it."}
        </p>
        {turns.length > 0 && (
          <button
            className="min-h-8 shrink-0 rounded-lg border border-zinc-300 px-2 dark:border-zinc-700"
            onClick={() => void clear()}
            type="button"
          >
            Clear
          </button>
        )}
      </div>

      <div
        aria-label="Conversation"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
        ref={transcriptRef}
        role="log"
      >
        {turns.length === 0 && !loading && !error && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Nothing asked yet. Choose an action below, or type a question.
          </p>
        )}

        {turns.map((turn, index) => (
          turn.role === "user" ? (
            <div className="flex justify-end" key={index}>
              <div className="max-w-[85%] rounded-xl rounded-br-sm bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800">
                <p>{turn.text}</p>
                {/* Only when the passage changes. Repeating the same quotation
                    under every turn of one conversation is noise. */}
                {turn.selectedText && turn.selectedText !== previousSubject(turns, index) && (
                  <p className="mt-1 border-l-2 border-zinc-300 pl-2 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
                    {excerpt(turn.selectedText, 120)}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <section aria-label="AI response" className="space-y-1" key={index}>
              <AnswerText>{turn.text}</AnswerText>
              {onSaveToNotes && (
                <button
                  className="min-h-8 rounded-lg border border-zinc-300 px-2 text-xs dark:border-zinc-700"
                  onClick={async () => {
                    await onSaveToNotes(turn.text);
                    setSaved(index);
                    window.setTimeout(
                      () => setSaved((current) => current === index ? null : current),
                      5000,
                    );
                  }}
                  type="button"
                >
                  {saved === index ? "Saved to notes" : "Save to notes"}
                </button>
              )}
            </section>
          )
        ))}

        {loading && (
          <div className="flex items-center justify-between gap-3">
            <p aria-live="polite" className="text-sm">Thinking…</p>
            <button
              className="min-h-8 shrink-0 rounded-lg border border-zinc-300 px-2 text-xs dark:border-zinc-700"
              onClick={cancel}
              type="button"
            >
              Cancel
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-300 p-3 text-sm" role="alert">
            <p>{error}</p>
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2 pt-3">
        <div aria-label="AI actions" className="flex flex-wrap items-center gap-2" role="group">
          {QUICK_ACTIONS.map((candidate) => (
            <button
              className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm disabled:opacity-50 dark:border-zinc-700"
              // Every action needs a passage to act on, and nothing else.
              disabled={loading || !subject}
              key={candidate}
              onClick={() => void send(candidate)}
              type="button"
            >
              {AI_ACTION_LABELS[candidate]}
            </button>
          ))}
          {/*
            The language belongs to Translate, so it is part of the Translate
            control rather than a field that comes and goes beside the others.
            A picker sitting next to an Explain result invited the question of
            what it was doing there.
          */}
          <div className="flex min-w-0">
            <button
              className="min-h-11 rounded-l-lg border border-zinc-300 px-3 text-sm disabled:opacity-50 dark:border-zinc-700"
              disabled={loading || !subject}
              onClick={() => void send("translate")}
              type="button"
            >
              {AI_ACTION_LABELS.translate}
            </button>
            <select
              aria-label="Translate into"
              className="min-h-11 min-w-0 rounded-r-lg border border-l-0 border-zinc-300 px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              disabled={loading}
              onChange={(event) => setLanguage(event.target.value)}
              value={language}
            >
              {TARGET_LANGUAGES.map((candidate) => (
                <option key={candidate} value={candidate}>{candidate}</option>
              ))}
            </select>
          </div>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = question.trim();
            setQuestion("");
            void send("ask", value);
          }}
        >
          <label className="sr-only" htmlFor="ai-follow-up">Ask about this passage</label>
          <input
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 dark:border-zinc-700"
            id="ai-follow-up"
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about this passage"
            value={question}
          />
          <button
            className="min-h-11 shrink-0 rounded-lg bg-zinc-900 px-4 font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            disabled={loading || !question.trim()}
            type="submit"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
