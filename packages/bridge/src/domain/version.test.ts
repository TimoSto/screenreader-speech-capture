import { describe, expect, it } from 'vitest';
import { isExactVersion } from './version.js';

describe('isExactVersion', () => {
  it.each(['1.56.1', '0.0.0', '1.57.0-beta-1', '1.0.0-rc.2'])('accepts %j', (version) => {
    expect(isExactVersion(version)).toBe(true);
  });

  it.each(['1.56', 'latest', '^1.56.1', '1.56.1 && calc', '1.56.1;x', ' 1.56.1', 1, null])(
    'rejects %j',
    (version) => {
      expect(isExactVersion(version)).toBe(false);
    },
  );
});
