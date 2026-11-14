import type http from 'node:http';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../../domain/errors.js';
import { type AccessRules, checkAccess } from './access.js';

const rules: AccessRules = { allowedHosts: [], ownHostnames: ['WIN-VM.lab.example'] };

function request(headers: http.IncomingHttpHeaders, method = 'GET') {
  return { method, headers } as http.IncomingMessage;
}

/** The error `checkAccess` throws, `undefined` if it lets the request through. */
function refusal(req: http.IncomingMessage, with_: Partial<AccessRules> = {}) {
  try {
    checkAccess(req, { ...rules, ...with_ });
    return undefined;
  } catch (error) {
    return error as AppError;
  }
}

describe('checkAccess', () => {
  it.each([
    '127.0.0.1:5151',
    '10.0.0.7',
    '[::1]:5151',
    '[fe80::1]',
    'localhost:5151',
    'LOCALHOST',
    'win-vm.lab.example:5151',
    'win-vm',
    'Win-VM:5151',
  ])('accepts Host %s', (host) => {
    expect(refusal(request({ host }))).toBeUndefined();
  });

  it.each(['evil.example:5151', 'win-vm.evil.example', 'localhost.evil.example', 'sub.localhost'])(
    'refuses Host %s with FORBIDDEN, naming the setting',
    (host) => {
      const error = refusal(request({ host }));
      expect(error).toBeInstanceOf(AppError);
      expect(error?.code).toBe('FORBIDDEN');
      expect(error?.message).toContain('http.allowedHosts');
    },
  );

  it('refuses a missing or broken Host header', () => {
    expect(refusal(request({}))?.code).toBe('FORBIDDEN');
    expect(refusal(request({ host: 'a b' }))?.code).toBe('FORBIDDEN');
  });

  it('accepts names from allowedHosts, case-insensitively, and any name with *', () => {
    const req = request({ host: 'bridge.lab.example:5151' });
    expect(refusal(req)?.code).toBe('FORBIDDEN');
    expect(refusal(req, { allowedHosts: ['Bridge.Lab.Example'] })).toBeUndefined();
    expect(refusal(req, { allowedHosts: ['*'] })).toBeUndefined();
  });

  it('refuses a state-changing request from another origin', () => {
    for (const origin of ['http://evil.example', 'null', 'https://127.0.0.1:5151']) {
      const error = refusal(request({ host: '127.0.0.1:5151', origin }, 'POST'));
      expect(error?.code).toBe('FORBIDDEN');
    }
  });

  it('accepts a state-changing request from its own origin or without an origin', () => {
    expect(
      refusal(request({ host: '127.0.0.1:5151', origin: 'http://127.0.0.1:5151' }, 'PUT')),
    ).toBeUndefined();
    expect(refusal(request({ host: '127.0.0.1:5151' }, 'POST'))).toBeUndefined();
  });

  it('lets reads from another origin through (the browser keeps the answer from the page)', () => {
    expect(
      refusal(request({ host: '127.0.0.1:5151', origin: 'http://evil.example' })),
    ).toBeUndefined();
  });

  it('refuses reads from another origin too with strictOrigin (the proxied services)', () => {
    const strict = (headers: http.IncomingHttpHeaders) => {
      try {
        checkAccess(request(headers), rules, { strictOrigin: true });
        return undefined;
      } catch (error) {
        return (error as AppError).code;
      }
    };
    expect(strict({ host: '127.0.0.1:5151', origin: 'http://evil.example' })).toBe('FORBIDDEN');
    expect(strict({ host: '127.0.0.1:5151', origin: 'http://127.0.0.1:5151' })).toBeUndefined();
    expect(strict({ host: '127.0.0.1:5151' })).toBeUndefined();
    expect(strict({ host: 'evil.example' })).toBe('FORBIDDEN');
  });
});
