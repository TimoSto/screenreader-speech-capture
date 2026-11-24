// Limits and patterns of the HTTP API, used by the bridge (to check), the client and the schemas
// (so docs/usage/openapi.yaml shows them).

/** Ranges of the speech endpoints. */
export const API_LIMITS = {
  /** `GET /speech?limit=`: the default and the most a caller may ask for. */
  list: { default: 1000, max: 10_000 },
  wait: {
    /** `GET /speech/wait?timeoutMs=`. */
    timeoutMs: { default: 5000, max: 300_000 },
    /** Entries the timeout answer holds at most: the last ones seen. */
    seen: 1000,
    /** Longest `regex`. */
    regexLength: 500,
  },
  /** Longest marker label (trimmed). */
  markerLength: 1000,
  /** Longest session `name`, `run` or client name (trimmed). */
  sessionLabelLength: 1000,
  /** `POST /input/click` and `POST /input/keys`. */
  input: {
    /** Largest absolute screen coordinate (physical pixels). */
    coordinate: 100_000,
    /** Pause between the chords of a sequence. */
    delayMs: { default: 50, max: 10_000 },
    /** Most chords in one request. */
    maxKeys: 100,
  },
  /**
   * `capture` of `POST /input/click` and `POST /input/keys` (and the client's `record()`, which
   * uses the same defaults): the defaults and ranges in milliseconds.
   */
  capture: {
    /** Silence that ends the capture. */
    quietForMs: { default: 500, min: 1, max: 60_000 },
    /** How long the first speech may take after the input. */
    firstWithinMs: { default: 2000, max: 300_000 },
    /** Longest capture, counted from the input. */
    timeoutMs: { default: 10_000, max: 300_000 },
    /** Silence to wait for before the input (0: none). */
    settleMs: { default: 0, max: 60_000 },
    /** Entries the answer holds at most: the first ones. */
    entries: 10_000,
  },
} as const;

/** Ranges of the settings (`GET` / `PUT /config`). */
export const CONFIG_LIMITS = {
  port: { min: 0, max: 65_535 },
  maxLineBytes: { min: 1024, max: 16 * 1024 * 1024 },
  maxEntries: { min: 1, max: 1_000_000 },
} as const;

/**
 * An exact npm version (`1.56.1`, `1.57.0-beta-1`): `playwright.version` ends up on an
 * `npm install` command line, so nothing else may get through.
 */
export const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** A host name without port or scheme, or `*` (`http.allowedHosts`). */
export const HOST_NAME_PATTERN = /^(\*|[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?)$/;

/** Whether `text` is a usable label: not empty after trimming, at most `max` characters trimmed. */
export const isTrimmedLabel = (text: string, max: number): boolean => {
  const trimmed = text.trim();
  return trimmed !== '' && trimmed.length <= max;
};
