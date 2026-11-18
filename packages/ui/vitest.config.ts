import { defineConfig } from 'vitest/config';

// The UI has two Vitest projects: pure logic and the BFF in node, components in real Chromium.
// This file lists both, so Vitest started inside `packages/ui` (for example by an IDE) runs either.
export default defineConfig({
  test: { projects: ['vitest.node.config.ts', 'vitest.components.config.ts'] },
});
