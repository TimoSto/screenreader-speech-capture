/** Unique, sortable ids for speech entries (ULID). */
export interface IdGenerator {
  next(): string;
}
