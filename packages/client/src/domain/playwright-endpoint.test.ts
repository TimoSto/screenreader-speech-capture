import { describe, expect, it } from 'vitest';
import { playwrightEndpoint } from './playwright-endpoint.js';

describe('playwrightEndpoint', () => {
  it('maps http to ws and https to wss', () => {
    expect(playwrightEndpoint('http://vm:5151')).toBe('ws://vm:5151/playwright');
    expect(playwrightEndpoint('https://vm.example')).toBe('wss://vm.example/playwright');
  });

  it('keeps a path prefix and ignores trailing slashes', () => {
    expect(playwrightEndpoint('http://vm:5151/bridge/')).toBe('ws://vm:5151/bridge/playwright');
  });
});
