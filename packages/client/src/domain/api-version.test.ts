import { expect, it } from 'vitest';
import { checkApiVersion } from './api-version.js';
import { IncompatibleBridgeError } from './errors.js';

it('accepts the same major version, whatever the minor', () => {
  expect(() => checkApiVersion('1.0', '1.0')).not.toThrow();
  expect(() => checkApiVersion('1.9', '1.0')).not.toThrow();
  expect(() => checkApiVersion('1.0', '1.4')).not.toThrow();
});

it.each(['2.0', '0.9', 'v1', '1', ''])('rejects bridge API %j for client 1.0', (bridge) => {
  expect(() => checkApiVersion(bridge, '1.0')).toThrow(IncompatibleBridgeError);
});
