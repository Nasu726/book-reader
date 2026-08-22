export interface AuthSessionReader {
  getSession(): Promise<{ userId: string } | null>;
}
