export type ReaderLocation = string;

export interface ReaderAdapter {
  open(location?: ReaderLocation): Promise<void>;
  restore(location: ReaderLocation): Promise<void>;
}
