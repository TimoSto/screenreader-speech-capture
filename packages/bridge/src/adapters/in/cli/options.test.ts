import { describe, expect, it } from 'vitest';
import { helpText, parseCli, UsageError } from './options.js';

describe('parseCli', () => {
  it('maps every flag to its setting and records the flag as the source', () => {
    const options = parseCli(
      [
        '--tcp-host=127.0.0.2',
        '--tcp-port',
        '4450',
        '--tcp-encoding',
        'utf-8',
        '--host',
        '127.0.0.1',
        '--http-port',
        '5152',
        '--allowed-hosts',
        'a.example, b.example,',
        '--playwright-port',
        '3001',
        '--playwright-version',
        '1.56.1',
        '--mcp-port',
        '8932',
        '--no-playwright',
        '--no-mcp',
        '--log-level',
        'debug',
        '--bridge-log',
        '/tmp/b.log',
        '--console-speech',
        '--config',
        '/tmp/c.json',
      ],
      {},
    );
    expect(options.overrides).toEqual({
      tcp: { host: '127.0.0.2', port: 4450, encoding: 'utf-8' },
      http: { host: '127.0.0.1', port: 5152, allowedHosts: ['a.example', 'b.example'] },
      playwright: { port: 3001, version: '1.56.1', enabled: false },
      mcp: { port: 8932, enabled: false },
      log: { level: 'debug', file: '/tmp/b.log', consoleSpeech: true },
    });
    expect(options.configFile).toBe('/tmp/c.json');
    expect(options.sources.get('tcp.port')).toBe('--tcp-port');
    expect(options.sources.get('mcp.enabled')).toBe('--no-mcp');
  });

  it('reads SR_SPEECH_* variables, and flags win over them', () => {
    const options = parseCli(['--tcp-port', '4451'], {
      SR_SPEECH_TCP_PORT: '4450',
      SR_SPEECH_HTTP_PORT: '5152',
      SR_SPEECH_ALLOWED_HOSTS: '*',
      SR_SPEECH_NO_MCP: '1',
      SR_SPEECH_CONSOLE_SPEECH: 'true',
      SR_SPEECH_CONFIG: '/etc/sr.json',
    });
    expect(options.overrides).toEqual({
      tcp: { port: 4451 },
      http: { port: 5152, allowedHosts: ['*'] },
      mcp: { enabled: false },
      log: { consoleSpeech: true },
    });
    expect(options.sources.get('tcp.port')).toBe('--tcp-port');
    expect(options.sources.get('http.port')).toBe('SR_SPEECH_HTTP_PORT');
    expect(options.configFile).toBe('/etc/sr.json');
  });

  it('treats a switch variable that is off or empty as not set', () => {
    const options = parseCli([], { SR_SPEECH_NO_MCP: '0', SR_SPEECH_CONSOLE_SPEECH: '' });
    expect(options.overrides).toEqual({});
    expect(options.sources.size).toBe(0);
  });

  it('leaves everything unset without flags and variables', () => {
    expect(parseCli([], {})).toEqual({
      overrides: {},
      sources: new Map(),
      configFile: undefined,
      help: false,
      version: false,
    });
  });

  it.each([
    [['--tcp-port', 'abc'], {}, '--tcp-port: must be a whole number'],
    [[], { SR_SPEECH_HTTP_PORT: '-1' }, 'SR_SPEECH_HTTP_PORT: must be a whole number'],
    [[], { SR_SPEECH_NO_MCP: 'maybe' }, 'SR_SPEECH_NO_MCP: must be 1 or 0'],
    [['--nope'], {}, "Unknown option '--nope'"],
    [['extra'], {}, 'extra'],
  ])('rejects %j %j, naming the flag or variable', (argv, env, message) => {
    expect(() => parseCli(argv, env)).toThrow(UsageError);
    expect(() => parseCli(argv, env)).toThrow(message);
  });

  it('knows --help and --version', () => {
    expect(parseCli(['-h'], {}).help).toBe(true);
    expect(parseCli(['--version'], {}).version).toBe(true);
  });
});

describe('helpText', () => {
  it('lists every flag with its argument', () => {
    const help = helpText();
    expect(help).toContain('--tcp-port <n>');
    expect(help).toContain('--no-mcp');
    expect(help).toContain('--config <path>');
    expect(help).toContain('SR_SPEECH_TCP_PORT');
  });
});
