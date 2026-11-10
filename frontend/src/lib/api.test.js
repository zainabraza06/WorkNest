import { describe, expect, it } from 'vitest';
import { ApiRequestError } from './api';

describe('ApiRequestError', () => {
  it('maps server validation details onto form fields', () => {
    const err = new ApiRequestError('Validation failed', {
      status: 400,
      details: [{ path: 'budget.max', message: 'Maximum must be at least the minimum' }],
    });
    expect(err.fieldErrors).toEqual({ 'budget.max': 'Maximum must be at least the minimum' });
  });

  it('has no field errors when the server sent none', () => {
    expect(new ApiRequestError('boom', { status: 500 }).fieldErrors).toEqual({});
  });
});
