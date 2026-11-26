import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeJson, routeRequest } from './route-request';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function stubFetch(answer: () => Response): { url?: string; init?: RequestInit } {
  const seen: { url?: string; init?: RequestInit } = {};
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return Promise.resolve(answer());
  });
  return seen;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('routeRequest', () => {
  it('sends a JSON body with its content type', async () => {
    const seen = stubFetch(() => new Response(null, { status: 204 }));
    await routeRequest('/ui/api/markers', { method: 'POST', body: { label: 'step 3' } });
    expect(seen.url).toBe('/ui/api/markers');
    expect(seen.init?.method).toBe('POST');
    expect(seen.init?.body).toBe('{"label":"step 3"}');
    expect(seen.init?.headers).toMatchObject({ 'content-type': 'application/json' });
  });

  it('sends no body and no content type without one', async () => {
    const seen = stubFetch(() => new Response(null, { status: 204 }));
    await routeRequest('/ui/api/sessions/end', { method: 'POST' });
    expect(seen.init?.body).toBeUndefined();
    expect(seen.init?.headers).not.toHaveProperty('content-type');
  });

  it("rejects with the route's message, or with the status", async () => {
    stubFetch(() => json({ message: 'The session is current' }, 409));
    await expect(routeRequest('/x', { method: 'DELETE' })).rejects.toThrow(
      'The session is current',
    );
    stubFetch(() => new Response('<html>', { status: 503 }));
    await expect(routeRequest('/x')).rejects.toThrow('The request answered 503');
  });

  it('hands the error body and the status to a custom rejection', async () => {
    stubFetch(() => json({ message: 'in use', field: 'tcp.port' }, 400));
    const rejection = vi.fn(() => new Error('custom'));
    await expect(routeRequest('/x', { rejection })).rejects.toThrow('custom');
    expect(rejection).toHaveBeenCalledWith({ message: 'in use', field: 'tcp.port' }, 400);
  });
});

describe('routeJson', () => {
  it('answers the parsed body as it is (the BFF checked it)', async () => {
    stubFetch(() => json({ sessions: [], currentId: null, outsideEntries: 0 }));
    await expect(routeJson('/ui/api/sessions')).resolves.toEqual({
      sessions: [],
      currentId: null,
      outsideEntries: 0,
    });
  });
});
