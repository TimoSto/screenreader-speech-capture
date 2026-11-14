/**
 * The `normalize` rule of the HTTP API (docs/usage/http-api.md). The bridge applies it in
 * `GET /speech/wait`, the client in its own waits, so both must use this one copy. It is the only
 * behaviour in this package: it belongs to the contract, not to either side.
 */

/** Lower case, whitespace runs collapsed to one space, trimmed. */
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Whether one text matches. */
export type TextTest = (text: string) => boolean;

/**
 * Test for a substring or a regular expression. With `normalize`, the text (and a substring) go
 * through {@link normalizeText} and a regular expression gets the `i` flag. `g` / `y` are dropped,
 * so the test keeps no state between texts. Returns `undefined` for an empty substring (after
 * normalizing); callers report that in their own way.
 */
export function createTextTest(match: string | RegExp, normalize: boolean): TextTest | undefined {
  const prepare = normalize ? normalizeText : (text: string) => text;

  if (match instanceof RegExp) {
    let flags = match.flags.replace(/[gy]/g, '');
    if (normalize && !flags.includes('i')) flags += 'i';
    const pattern = new RegExp(match.source, flags);
    return (text) => pattern.test(prepare(text));
  }

  const needle = prepare(match);
  if (needle === '') return undefined;
  return (text) => prepare(text).includes(needle);
}
