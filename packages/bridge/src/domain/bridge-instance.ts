/**
 * One run of the bridge. `seq` and session ids start at 1 with every run, so clients compare
 * `id` to tell whether a `seq` they hold still refers to this buffer (docs/http-api.md).
 */
export interface BridgeInstance {
  /** Random, different for every run. */
  readonly id: string;
  readonly startedAt: Date;
}
