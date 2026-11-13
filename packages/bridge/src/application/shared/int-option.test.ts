import { describe, expect, it } from 'vitest';
import { AppError } from '../../domain/errors.js';
import { intOption } from './int-option.js';

const range = { fallback: 5, min: 1, max: 10 };

describe('intOption', () => {
  it('uses the fallback when the value is missing', () => {
    expect(intOption('limit', undefined, range)).toBe(5);
  });

  it.each([1, 7, 10])('accepts %d inside the range', (value) => {
    expect(intOption('limit', value, range)).toBe(value);
  });

  it.each([0, 11, 1.5, Number.NaN])('rejects %d, naming the field', (value) => {
    let error: unknown;
    try {
      intOption('limit', value, range);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      code: 'INVALID_REQUEST',
      message: 'limit: must be an integer from 1 to 10',
      details: { field: 'limit' },
    });
  });
});
