import { describe, expect, it } from 'vitest';
import { createHealthResponse } from './index.js';

describe('createHealthResponse', () => {
  it('returns a deterministic response for the supplied time', () => {
    const response = createHealthResponse(new Date('2026-08-15T12:00:00.000Z'));

    expect(response).toEqual({
      service: 'macromap-api',
      status: 'ok',
      time: '2026-08-15T12:00:00.000Z',
    });
  });
});
