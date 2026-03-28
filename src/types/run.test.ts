import { describe, expect, it } from 'vitest';

import { RUN_DEFAULTS } from '@/types/run';

describe('RUN_DEFAULTS', () => {
  it('has the expected default values', () => {
    expect(RUN_DEFAULTS).toEqual({
      difficulty: 2,
      targetMinutes: 15,
    });
  });
});
