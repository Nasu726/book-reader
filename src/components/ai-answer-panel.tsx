"use client";

import { useEffect, useRef, useState } from "react";

import { COMMAND_ACTIONS, parseCommand } from "@/core/ai/action-service";
import { AnswerText } from "./answer-text";
import type { AiConversation } from "./use-ai-actions";

const TARGET_LANGUAGES = [
  "Japanese",
  "English",
  "French",
  "Portuguese",
  "Simplified Chinese",
  "Spanish",
] as const;

/** The passage the question before this one was about. */
function previousSubject(
  turns: readonly { role: string; selectedText?: string }[],
  index: number,
): string | undefined {
  for (let earlier = index - 1; earlier >= 0; earlier -= 1) {
    if (turns[earlier].role === "user") return turns[earlier].selectedText;
  }
  return undefined;
}

/** Enough of the passage to recognise it, not enough to fill the margin. */
function excerpt(text: string, limit = 90): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit - 1)}…` : collapsed;
}

/**
 * One conversation about the book, and one place to add to it.
 *
 * Everything here follows from a single rule: the composer sends, and nothing
 * else does. The transcript above it carries no border, because a box with a
 * border in a column of controls reads as somewhere to type and it is not. The
 * commands live inside the composer rather than between it and the transcript,
 * so there is nothing between what was said and where you say the next thing.
 *
 * The action is named in the input as `/explain`, which is also what the
 * buttons write there. That makes asking about a passage and asking a plain
 * question the same gesture with the same control, instead of a mode switch
 * with two inputs that did the same job under different names.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<number | null>(null);

  // Follow the conversation down as it grows, the way any chat does.
  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [turns.length, loading]);

  const command = parseCommand(question);
  const needsPassage = command.action !== "ask" && !subject;
  const canSend = !loading && !needsPassage
    && (command.action !== "ask" || command.question.length > 0);

  function submit() {
    if (!canSend) return;
    setQuestion("");
    void send(command.action, command.question);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        aria-label="Conversation"
        className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1"
        ref={transcriptRef}
        role="log"
      >
        {turns.map((turn, index) => (
          turn.role === "user" ? (
            <div className="flex justify-end" key={index}>
              <div className="border-marker max-w-[85%] border-r-2 pr-2 text-right">
                <p className="text-xs tracking-wide uppercase">{turn.text}</p>
                {/* Only when the passage changes. Repeating the same quotation
                    under every turn of one conversation is noise. */}
                {turn.selectedText && turn.selectedText !== previousSubject(turns, index) && (
                  <p className="text-ink-quiet mt-1 text-sm">{excerpt(turn.selectedText, 120)}</p>
                )}
              </div>
            </div>
          ) : (
            <section aria-label="AI response" className="space-y-1" key={index}>
              <AnswerText>{turn.text}</AnswerText>
              {onSaveToNotes && (
                <button
                  className="text-ink-quiet hover:text-ink text-xs tracking-wide uppercase transition-colors duration-(--fast)"
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
          <div className="text-ink-quiet flex items-center justify-between gap-3 text-xs tracking-wide uppercase">
            <p aria-live="polite">Thinking…</p>
            <button className="hover:text-ink transition-colors duration-(--fast)" onClick={cancel} type="button">
              Cancel
            </button>
          </div>
        )}

        {error && (
          <div className="border-marker border-l-2 pl-3 text-sm" role="alert">
            <p>{error}</p>
          </div>
        )}
      </div>

      {/* The only thing that sends. A divider rather than a box around
          everything: the field below carries its own edge, and a box inside a
          box makes it harder, not easier, to see where typing happens. */}
      <form
        className="border-rule mt-3 shrink-0 space-y-2 border-t pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-wrap items-center gap-1">
          <div aria-label="AI actions" className="flex gap-1" role="group">
            {COMMAND_ACTIONS.map((action) => (
              <button
                aria-label={`Insert /${action}`}
                className={`border-edge min-h-9 shrink-0 rounded-lg border px-2 text-xs tracking-wide uppercase transition-colors duration-(--fast) ${
                  command.action === action
                    ? "bg-marker border-marker text-ink-on-marker"
                    : "text-ink-quiet hover:text-ink"
                }`}
                key={action}
                // Writing the command rather than sending it: one control
                // sends, so a passage and a question of your own about it are
                // the same gesture. Never steals the selection it is about.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setQuestion(`/${action} `);
                  inputRef.current?.focus();
                }}
                type="button"
              >
                /{action}
              </button>
            ))}
          </div>
          {/* Named for what it removes, and standing with the other controls
              rather than pushed to the far edge where it read as the odd one
              out that clears something unspecified. */}
          {turns.length > 0 && (
            <button
              className="text-ink-quiet hover:text-ink min-h-9 shrink-0 px-2 text-xs tracking-wide uppercase transition-colors duration-(--fast)"
              onClick={() => void clear()}
              type="button"
            >
              Clear conversation
            </button>
          )}
        </div>

        {command.action === "translate" && (
          <label className="text-ink-quiet flex items-center gap-2 text-xs">
            Into
            <select
              aria-label="Translate into"
              className="text-ink min-h-9 min-w-0 flex-1 bg-transparent text-base"
              disabled={loading}
              onChange={(event) => setLanguage(event.target.value)}
              value={language}
            >
              {TARGET_LANGUAGES.map((candidate) => (
                <option key={candidate} value={candidate}>{candidate}</option>
              ))}
            </select>
          </label>
        )}

        {/* What the command will act on, shown where the command is written.
            A question needs no passage, so this says what is missing only when
            something is. */}
        <p className="text-ink-quiet border-rule border-l-2 pl-2 text-sm">
          {subject ? excerpt(subject.text) : "No passage selected — questions still work"}
        </p>

        <div className="border-edge bg-field focus-within:border-marker flex gap-2 rounded-lg border p-1 transition-colors duration-(--fast)">
          <label className="sr-only" htmlFor="ai-follow-up">Ask about this passage</label>
          <input
            className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-base outline-none"
            id="ai-follow-up"
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={needsPassage ? "Select a passage to use this command" : "Ask about this book"}
            ref={inputRef}
            value={question}
          />
          <button
            aria-label="Send"
            className="bg-ink text-paper flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-transform duration-(--fast) ease-(--ease) active:scale-95 disabled:opacity-30"
            disabled={!canSend}
            type="submit"
          >
            <svg aria-hidden fill="none" height="16" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="16">
              <path d="M5 12h13M12 5.5 18.5 12 12 18.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
