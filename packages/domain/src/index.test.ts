import { describe, expect, it } from 'vitest';
import { reserveForPlannedMeals } from './index.js';

describe('reserveForPlannedMeals', () => {
  it('reserves fifteen percent for snacks by default', () => {
    expect(
      reserveForPlannedMeals({
        carbohydrateGrams: 300,
        fatGrams: 80,
        kilocalories: 2_500,
        proteinGrams: 180,
      }),
    ).toEqual({
      carbohydrateGrams: 255,
      fatGrams: 68,
      kilocalories: 2_125,
      proteinGrams: 153,
    });
  });

  it('rejects an invalid snack reserve', () => {
    expect(() =>
      reserveForPlannedMeals(
        {
          carbohydrateGrams: 300,
          fatGrams: 80,
          kilocalories: 2_500,
          proteinGrams: 180,
        },
        1,
      ),
    ).toThrow(RangeError);
  });
});
