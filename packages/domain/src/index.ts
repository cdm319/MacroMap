export interface MacroTarget {
  readonly carbohydrateGrams: number;
  readonly fatGrams: number;
  readonly kilocalories: number;
  readonly proteinGrams: number;
}

export const DEFAULT_SNACK_RESERVE = 0.15;

export function reserveForPlannedMeals(
  target: MacroTarget,
  snackReserve: number = DEFAULT_SNACK_RESERVE,
): MacroTarget {
  if (snackReserve < 0 || snackReserve >= 1) {
    throw new RangeError('Snack reserve must be at least 0 and less than 1.');
  }

  const plannedShare = 1 - snackReserve;

  return {
    carbohydrateGrams: target.carbohydrateGrams * plannedShare,
    fatGrams: target.fatGrams * plannedShare,
    kilocalories: target.kilocalories * plannedShare,
    proteinGrams: target.proteinGrams * plannedShare,
  };
}

export * from './schema-org-recipe.js';
