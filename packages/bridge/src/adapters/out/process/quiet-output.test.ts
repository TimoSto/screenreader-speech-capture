import { describe, expect, it } from 'vitest';
import { MemoryLogger } from '../../../../test/fakes.js';
import { listeningLine, mcpBanner, quietOutput } from './quiet-output.js';

describe('quietOutput', () => {
  it('sends the MCP start banner to debug and everything else on unchanged', () => {
    const inner = new MemoryLogger();
    const out = quietOutput(inner, mcpBanner());
    for (const line of [
      'Listening on http://127.0.0.1:8931',
      'Put this in your client config:',
      '{',
      '}',
      'For legacy SSE transport support, you can use the /sse endpoint instead.',
    ]) {
      out.warn(line);
    }
    out.warn('a real warning');
    out.info('after');
    expect(inner.lines.filter((l) => !l.startsWith('debug '))).toEqual([
      'warn a real warning',
      'info after',
    ]);
    expect(inner.lines.filter((l) => l.startsWith('debug '))).toHaveLength(5);
  });

  it('demotes only the "Listening on" line of the Playwright server', () => {
    const inner = new MemoryLogger();
    const out = quietOutput(inner, listeningLine);
    out.info('Listening on ws://127.0.0.1:3000/');
    out.info('next line');
    expect(inner.lines).toEqual(['debug Listening on ws://127.0.0.1:3000/', 'info next line']);
  });
});
