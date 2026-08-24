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

export type AiActionInput = {
  action: AiAction;
  selectedText: string;
  userQuestion?: string;
  targetLanguage?: string;
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
  if (input.action === "translate") {
    const source = input.sourceLanguage?.trim() || "auto-detected";
    return `Translate the selected text from ${source} into ${input.targetLanguage ?? "English"}. Preserve meaning and tone.`;
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
  if (!input.selectedText.trim()) {
    throw new AiActionError("empty_selection", "Select some text first.");
  }

  const instruction = actionInstruction(input);
  const promptParts = [instruction];
  if (input.action === "ask" && input.userQuestion) {
    promptParts.push(`Question: ${input.userQuestion}`);
  }
  promptParts.push("Selected text:", input.selectedText.trim());
  const sectionTitle = findPaperSectionTitle(input.paperStructure, input.selectedText);

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
