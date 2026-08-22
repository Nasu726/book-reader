export type AiRequest = {
  prompt: string;
  context?: string;
};

export type AiResponse = {
  content: string;
};

export interface AiProvider {
  generate(request: AiRequest): Promise<AiResponse>;
}
