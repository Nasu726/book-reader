"use client";

import { AI_ACTIONS } from "@/core/ai/action-service";
import type { DocumentSelection } from "@/core/selection/capture";
import { AnswerText } from "./answer-text";
import type { AiConversation } from "./use-ai-actions";

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
  conversation,
  onHighlightCreated,
  selection,
}: {
  conversation: AiConversation;
  onHighlightCreated?: (selection: DocumentSelection) => Promise<void> | void;
  selection: DocumentSelection | null;
}) {
  const {
    action, cancel, error, history, language, loading, question,
    run, setLanguage, setQuestion,
  } = conversation;

  return (
    // No flex-1 anywhere in here. The pane around this panel is the scroll
    // container; competing for its height is what collapsed the answer box to
    // nothing and printed its text over the controls below it.
    <div className="space-y-4">
      <div aria-label="AI actions" className="flex flex-wrap gap-2" role="group">
        {AI_ACTIONS.map((candidate) => (
          <button
            className={`min-h-11 rounded-lg border px-3 text-sm ${
              action === candidate
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
            // Every action needs something to act on, so none of them is
            // offered until there is a selection. Letting them fire produced an
            // error with a Retry button that could only fail the same way.
            disabled={loading || !selection}
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
      {/*
        Only shown while Translate is the chosen action. A language picker
        sitting next to an Explain result invites the question of what it is
        doing there; a control should belong to the state it is displayed in.
        The value is shared, so the language chosen here is also the language
        answers come back in.
      */}
      {action === "translate" && (
        <div className="flex items-center gap-2">
          <label className="shrink-0 text-sm font-medium" htmlFor="translation-target-language">Translate to</label>
          <select
            className="min-h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            disabled={loading}
            id="translation-target-language"
            onChange={(event) => {
              setLanguage(event.target.value);
            }}
            value={language}
          >
            {TARGET_LANGUAGES.map((candidate) => (
              <option key={candidate} value={candidate}>{candidate}</option>
            ))}
          </select>
        </div>
      )}
      <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
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
        {!loading && !error && !selection && history.length === 0 && (
          <p className="text-sm">
            Select a passage in the document, then choose an action above.
          </p>
        )}
        {!loading && !error && (selection || history.length > 0) && (
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
