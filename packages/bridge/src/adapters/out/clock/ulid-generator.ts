import { monotonicFactory } from 'ulid';
import type { IdGenerator } from '../../../application/ports/out/id-generator.js';

/** ULIDs, strictly increasing even within the same millisecond. */
export class UlidGenerator implements IdGenerator {
  private readonly ulid = monotonicFactory();

  next(): string {
    return this.ulid();
  }
}
