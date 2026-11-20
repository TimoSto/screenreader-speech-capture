import { describe, expect, it } from 'vitest';
import { parseCollapsed, type SessionsPaneStorage } from '#lib/core/sessions-pane.js';
import { createSessionsPaneStore } from './sessions-pane.svelte.js';

function fakeStorage(initial: boolean | null): SessionsPaneStorage & { saved: boolean | null } {
  return {
    saved: initial,
    read() {
      return this.saved;
    },
    write(collapsed) {
      this.saved = collapsed;
    },
  };
}

describe('createSessionsPaneStore', () => {
  it('starts expanded', () => {
    expect(createSessionsPaneStore(fakeStorage(true)).collapsed).toBe(false);
  });

  it('picks up the saved choice on init', () => {
    const store = createSessionsPaneStore(fakeStorage(true));
    store.init();
    expect(store.collapsed).toBe(true);
  });

  it('stays expanded on init when nothing is saved', () => {
    const store = createSessionsPaneStore(fakeStorage(null));
    store.init();
    expect(store.collapsed).toBe(false);
  });

  it('toggles and saves', () => {
    const storage = fakeStorage(null);
    const store = createSessionsPaneStore(storage);
    store.toggle();
    expect(store.collapsed).toBe(true);
    expect(storage.saved).toBe(true);
    store.toggle();
    expect(storage.saved).toBe(false);
  });
});

describe('parseCollapsed', () => {
  it('reads 1 and 0, and ignores anything else', () => {
    expect(parseCollapsed('1')).toBe(true);
    expect(parseCollapsed('0')).toBe(false);
    expect(parseCollapsed('x')).toBeNull();
    expect(parseCollapsed(null)).toBeNull();
  });
});
