import type { AiProvider } from "./provider.ts";
import { findPaperSectionTitle, type PaperStructure } from "../documents/paper-structure.ts";
import {
  AiProviderError,
  generateWithTimeout,
} from "./provider.ts";

export const AI_ACTIONS = [
  "explain",
  "translate",
  "simplify",
  "ask",
  "highlight",
] as const;

export type AiAction = (typeof AI_ACTIONS)[number];

/** What an action is called, wherever one has to be named to a person. */
export const AI_ACTION_LABELS: Record<AiAction, string> = {
  ask: "Ask",
  explain: "Explain",
  highlight: "Highlight",
  simplify: "Simplify",
  translate: "Translate",
};

/**
 * The reader's side of one exchange, as a line worth showing them again.
 *
 * What used to be kept was the built prompt — instructions, context, and the
 * passage, several hundred characters of machine-facing text. Reopening a
 * document printed all of it back as though the model had said it, so asking
 * one question showed every prompt that came before it. A conversation should
 * read like the conversation it was.
 */
export function describeUserTurn(input: {
  action: AiAction;
  question?: string;
  targetLanguage?: string;
}): string {
  const question = input.question?.trim();
  if (input.action === "ask") return question || AI_ACTION_LABELS.ask;
  if (input.action === "translate") {
    const target = input.targetLanguage?.trim();
    return target ? `Translate into ${target}` : AI_ACTION_LABELS.translate;
  }
  return AI_ACTION_LABELS[input.action];
}

/** Actions a reader can name in the composer. Highlighting is not one. */
export const COMMAND_ACTIONS = ["explain", "translate", "simplify"] as const;

/**
 * The action and the question, read out of one line of input.
 *
 * There is one place to type and one button to send. A leading `/explain` says
 * what to do with the attached passage; anything else is a question. Two inputs
 * — an action called Ask and a field called Follow-up question — were two names
 * for the same thing, and neither explained how to ask about a passage without
 * first choosing a mode.
 */
export function parseCommand(input: string): { action: AiAction; question: string } {
  const trimmed = input.trim();
  const match = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(trimmed);
  const named = match?.[1]?.toLowerCase();
  const action = (COMMAND_ACTIONS as readonly string[]).includes(named ?? "")
    ? (named as AiAction)
    : null;
  return action
    ? { action, question: (match?.[2] ?? "").trim() }
    : { action: "ask", question: trimmed };
}

export type AiActionInput = {
  action: AiAction;
  selectedText: string;
  userQuestion?: string;
  targetLanguage?: string;
  /** The language answers come back in. Not defaulted here: the reader chooses. */
  responseLanguage?: string;
  documentTitle?: string;
  paperStructure?: PaperStructure;
  surroundingText?: { before?: string; after?: string };
  sourceLanguage?: string;
};

const ACTION_INSTRUCTIONS: Record<AiAction, string> = {
  explain: "Explain the selected text clearly and concisely.",
  highlight: "Highlight is persisted locally and is not sent to the provider.",
  translate: "",
  simplify: "Simplify the selected text without losing essential meaning.",
  ask: "Answer the user's question using the provided context when relevant.",
};

function actionInstruction(input: AiActionInput): string {
  if (input.action === "ask" && !input.selectedText.trim()) {
    return "Answer the user's question about the document being read.";
  }
  if (input.action === "translate") {
    // The source language is left unstated unless the reader names one. Someone
    // reading in several languages does not want English assumed, and "from
    // auto" is not an instruction — it is a placeholder leaking into a prompt.
    const source = input.sourceLanguage?.trim();
    const from = source && source !== "auto" ? ` from ${source}` : "";
    const target = input.targetLanguage?.trim();
    if (!target) {
      throw new AiActionError("invalid_action", "Choose a language to translate into.");
    }
    return `Translate the selected text${from} into ${target}. Preserve meaning and tone.`;
  }
  return ACTION_INSTRUCTIONS[input.action];
}

export class AiActionError extends Error {
  readonly code:
    | "invalid_action"
    | "empty_selection"
    | "provider_timeout"
    | "cancelled"
    | "provider_unavailable";
  readonly retryable: boolean;

  constructor(
    code: typeof AiActionError.prototype.code,
    message: string,
    options: { retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AiActionError";
    this.code = code;
    this.retryable = options.retryable ?? false;
  }
}

export function buildPrompt(input: AiActionInput): {
  prompt: string;
  context: string;
} {
  const selected = input.selectedText.trim();
  const asked = input.userQuestion?.trim();

  // A question about the book needs no passage. Explaining, translating and
  // simplifying do: there is nothing to act on otherwise. Requiring a selection
  // for all four meant a reader could not ask "what is this chapter about"
  // without first picking a sentence at random to attach it to.
  if (!selected && !(input.action === "ask" && asked)) {
    throw new AiActionError(
      "empty_selection",
      input.action === "ask"
        ? "Type a question, or select a passage."
        : "Select a passage in the book first.",
    );
  }

  const instruction = actionInstruction(input);
  const promptParts = [instruction];
  // Translate already names its target language, so saying it twice would only
  // give the model two instructions to reconcile.
  if (input.responseLanguage && input.action !== "translate") {
    promptParts.push(`Respond in ${input.responseLanguage}.`);
  }
  if (input.action === "ask" && asked) {
    promptParts.push(`Question: ${asked}`);
  }
  if (selected) promptParts.push("Selected text:", selected);
  const sectionTitle = findPaperSectionTitle(input.paperStructure, selected);

  return {
    prompt: promptParts.join("\n"),
    context: [
      input.documentTitle && `Document: ${input.documentTitle}`,
      input.paperStructure?.title && `Paper title: ${input.paperStructure.title}`,
      sectionTitle && `Section: ${sectionTitle}`,
      input.paperStructure?.abstract && `Abstract: ${input.paperStructure.abstract}`,
      input.surroundingText?.before,
      input.surroundingText?.after,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

export async function runAiAction(
  provider: AiProvider,
  input: AiActionInput,
): Promise<string> {
  if (!AI_ACTIONS.includes(input.action)) {
    throw new AiActionError("invalid_action", "Unsupported AI action.");
  }
  if (input.action === "highlight") return "Highlight saved locally.";

  try {
    const { prompt, context } = buildPrompt(input);
    const response = await generateWithTimeout(provider, {
      prompt,
      context: context || undefined,
    });
    return response.content;
  } catch (cause) {
    if (cause instanceof AiActionError) {
      throw cause;
    }
    if (cause instanceof AiProviderError) {
      throw new AiActionError(
        cause.reason === "timeout"
          ? "provider_timeout"
          : cause.reason === "cancelled"
            ? "cancelled"
            : "provider_unavailable",
        "The AI request could not be completed. Please try again.",
        { retryable: cause.retryable, cause },
      );
    }
    throw new AiActionError(
      "provider_unavailable",
      "The AI request could not be completed. Please try again.",
      { cause },
    );
  }
}
