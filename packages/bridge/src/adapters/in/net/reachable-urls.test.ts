import type os from 'node:os';
import { expect, it } from 'vitest';
import { reachableUrls } from './reachable-urls.js';

const info = (
  address: string,
  family: 'IPv4' | 'IPv6' = 'IPv4',
  internal = false,
): os.NetworkInterfaceInfo =>
  ({ address, family, internal, netmask: '', mac: '', cidr: null }) as os.NetworkInterfaceInfo;

const interfaces = {
  lo: [info('127.0.0.1', 'IPv4', true), info('::1', 'IPv6', true)],
  Ethernet: [info('192.168.122.57'), info('fe80::1', 'IPv6')],
  'vEthernet (WSL)': [info('172.20.0.1')],
};

it('lists the external IPv4 addresses and localhost for a wildcard host', () => {
  const expected = [
    'http://192.168.122.57:5151',
    'http://172.20.0.1:5151',
    'http://localhost:5151',
  ];
  expect(reachableUrls('http', '0.0.0.0', 5151, interfaces)).toEqual(expected);
  expect(reachableUrls('http', '::', 5151, interfaces)).toEqual(expected);
});

it('falls back to localhost without network, and keeps a specific host as it is', () => {
  expect(reachableUrls('http', '0.0.0.0', 5151, { lo: interfaces.lo })).toEqual([
    'http://localhost:5151',
  ]);
  expect(reachableUrls('http', '127.0.0.1', 5151, interfaces)).toEqual(['http://127.0.0.1:5151']);
  expect(reachableUrls('ws', '::1', 3000, interfaces)).toEqual(['ws://[::1]:3000']);
});
