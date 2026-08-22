export type ContextInput = {
  selectedText: string;
  userQuestion?: string;
  documentTitle?: string;
  surroundingText?: {
    before?: string;
    after?: string;
  };
};

export function buildContext(input: ContextInput): string {
  const sections = [
    input.documentTitle && `Document: ${input.documentTitle}`,
    input.surroundingText?.before,
    `Selected: ${input.selectedText}`,
    input.surroundingText?.after,
    input.userQuestion && `Question: ${input.userQuestion}`,
  ].filter(Boolean);

  return sections.join("\n\n");
}
