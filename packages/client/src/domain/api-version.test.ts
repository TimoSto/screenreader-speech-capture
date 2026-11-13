import { expect, it } from 'vitest';
import { checkApiVersion, requireApiVersion } from './api-version.js';
import { IncompatibleBridgeError } from './errors.js';

it('accepts the same major version, whatever the minor', () => {
  expect(() => checkApiVersion('1.0', '1.0')).not.toThrow();
  expect(() => checkApiVersion('1.9', '1.0')).not.toThrow();
  expect(() => checkApiVersion('1.0', '1.4')).not.toThrow();
});

it.each(['2.0', '0.9', 'v1', '1', ''])('rejects bridge API %j for client 1.0', (bridge) => {
  expect(() => checkApiVersion(bridge, '1.0')).toThrow(IncompatibleBridgeError);
});

it('requireApiVersion accepts the needed minor or newer, and names the feature otherwise', () => {
  expect(() => requireApiVersion('1.3', '1.3', 'Sessions')).not.toThrow();
  expect(() => requireApiVersion('1.4', '1.3', 'Sessions')).not.toThrow();
  expect(() => requireApiVersion('1.2', '1.3', 'Sessions')).toThrow(
    'Sessions need a bridge with API 1.3 or newer, this one speaks API 1.2',
  );
  expect(() => requireApiVersion('2.5', '1.3', 'Sessions')).toThrow(IncompatibleBridgeError);
});
