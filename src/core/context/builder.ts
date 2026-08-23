export type ContextInput = {
  selectedText: string;
  userQuestion?: string;
  documentTitle?: string;
  sectionTitle?: string;
  surroundingText?: {
    before?: string;
    after?: string;
  };
  tokenBudget?: number;
};

export function buildContext(input: ContextInput): string {
  const budget = input.tokenBudget ?? 2000;
  if (!Number.isInteger(budget) || budget <= 0) {
    throw new Error("Token budget must be a positive integer.");
  }

  const selected = `Selected: ${input.selectedText.trim()}`;
  const question = input.userQuestion?.trim()
    ? `Question: ${input.userQuestion.trim()}`
    : "";
  const metadata = [
    input.documentTitle?.trim() && `Document: ${input.documentTitle.trim()}`,
    input.sectionTitle?.trim() && `Section: ${input.sectionTitle.trim()}`,
  ].filter(Boolean);
  const before = input.surroundingText?.before?.trim()
    ? `Before source: ${input.surroundingText.before.trim()}`
    : "";
  const after = input.surroundingText?.after?.trim()
    ? `After source: ${input.surroundingText.after.trim()}`
    : "";

  const requiredParts = [selected, question].filter(Boolean);
  let remainingBudget = budget - estimateTokens(requiredParts.join("\n\n"));
  const optionalParts: string[] = [];

  for (const part of [...metadata, before, after]) {
    if (!part || remainingBudget <= 0) {
      continue;
    }
    const available = remainingBudget;
    optionalParts.push(trimToTokenBudget(part, available));
    remainingBudget -= estimateTokens(trimToTokenBudget(part, available));
  }

  return [...requiredParts, ...optionalParts].join("\n\n");
}

function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

function trimToTokenBudget(value: string, tokenBudget: number): string {
  const maximumCharacters = tokenBudget * 4;
  if (value.length <= maximumCharacters) {
    return value;
  }
  return `${value.slice(0, maximumCharacters - 1).trimEnd()}…`;
}
