import { error } from '@sveltejs/kit';
import { parseScope, type SessionScope } from '#lib/core/sessions.js';

/**
 * The `?session=` of a BFF request: a session id or `none`. Without the parameter it is `null`
 * (the bridge then uses its default scope), unless `required`. Anything else answers 400.
 */
export function scopeParam(url: URL, required: true): SessionScope;
export function scopeParam(url: URL, required?: false): SessionScope | null;
export function scopeParam(url: URL, required = false): SessionScope | null {
  const value = url.searchParams.get('session');
  if (value === null && !required) return null;
  const scope = value === null ? null : parseScope(value);
  if (scope === null) error(400, 'session must be a session id or "none"');
  return scope;
}
