import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'bridge',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
