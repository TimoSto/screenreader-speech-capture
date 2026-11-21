import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type Config } from '../../../../domain/config/index.js';
import { toConfigDto, toConfigOverridesDto } from './config.js';

describe('toConfigDto', () => {
  it('maps every setting', () => {
    expect(toConfigDto(DEFAULT_CONFIG)).toEqual(DEFAULT_CONFIG);
  });

  it('drops a field the contract does not list', () => {
    const withSecret = {
      ...DEFAULT_CONFIG,
      http: { ...DEFAULT_CONFIG.http, token: 'secret' },
    } as Config;
    expect(toConfigDto(withSecret).http).toEqual(DEFAULT_CONFIG.http);
  });

  it('copies the overrides', () => {
    const overrides = { 'tcp.port': '--tcp-port' };
    const dto = toConfigOverridesDto(overrides);
    expect(dto).toEqual({ overrides });
    expect(dto.overrides).not.toBe(overrides);
  });
});
