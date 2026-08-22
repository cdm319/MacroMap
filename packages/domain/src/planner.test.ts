import { describe, expect, it } from 'vitest';
import {
  generateWeeklyPlan,
  type PlanningRecipe,
  type WeeklyPlanningInput,
} from './planner.js';

const people = [
  {
    displayName: 'Chris',
    id: '00000000-0000-4000-8000-000000000101',
    macroTargets: {
      carbsGrams: 200,
      fatGrams: 80,
      kcal: 2_000,
      proteinGrams: 200,
    },
  },
  {
    displayName: 'Alex',
    id: '00000000-0000-4000-8000-000000000102',
    macroTargets: {
      carbsGrams: 150,
      fatGrams: 60,
      kcal: 1_500,
      proteinGrams: 150,
    },
  },
] as const;

function recipe(
  id: number,
  title: string,
  mealType: 'breakfast' | 'lunch' | 'dinner',
  nutrition: PlanningRecipe['nutrition'],
  options: Partial<PlanningRecipe> = {},
): PlanningRecipe {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    ingredients: [`ingredient ${id}`, 'olive oil'],
    mealTypes: [mealType],
    nutrition,
    nutritionConfidence: 'high',
    tags: {
      cuisines: [`cuisine ${id}`],
      flavours: [`flavour ${id}`],
      proteins: [`protein ${id}`],
    },
    title,
    ...options,
  };
}

function planningInput(
  recipes: ReadonlyArray<PlanningRecipe>,
  recentDinnerRecipeIds: ReadonlyArray<string> = [],
): WeeklyPlanningInput {
  return {
    people,
    recentDinnerRecipeIds,
    recipes,
    snackReserve: 0.15,
    weekStart: '2026-08-24',
  };
}

const breakfast = recipe(1, 'Oats', 'breakfast', {
  carbsGrams: 42.5,
  fatGrams: 17,
  kcal: 425,
  proteinGrams: 42.5,
});
const lunch = recipe(2, 'Chicken bowl', 'lunch', {
  carbsGrams: 51,
  fatGrams: 20.4,
  kcal: 510,
  proteinGrams: 51,
});
const dinnerNutrition = {
  carbsGrams: 76.5,
  fatGrams: 30.6,
  kcal: 765,
  proteinGrams: 76.5,
};

describe('weekly planner', () => {
  it('builds the complete week deterministically with quarter servings', () => {
    const recipes = [
      breakfast,
      lunch,
      ...Array.from({ length: 5 }, (_, index) =>
        recipe(index + 10, `Dinner ${index + 1}`, 'dinner', dinnerNutrition),
      ),
    ];

    const first = generateWeeklyPlan(planningInput(recipes));
    const second = generateWeeklyPlan(planningInput([...recipes].reverse()));

    expect(first).toEqual(second);
    expect(first.days).toHaveLength(7);
    expect(first.days[0]?.date).toBe('2026-08-24');
    expect(first.days[6]?.date).toBe('2026-08-30');
    expect(first.days.every(({ slots }) => slots.length === 3)).toBe(true);
    expect(
      first.days
        .flatMap(({ slots }) => slots)
        .every(({ meal }) =>
          meal?.portions.every(({ servings }) => (servings * 4) % 1 === 0),
        ),
    ).toBe(true);
    expect(first.days[0]?.macros).toEqual([
      {
        personId: people[0].id,
        planned: {
          carbsGrams: 170,
          fatGrams: 68,
          kcal: 1_700,
          proteinGrams: 170,
        },
        target: {
          carbsGrams: 170,
          fatGrams: 68,
          kcal: 1_700,
          proteinGrams: 170,
        },
      },
      {
        personId: people[1].id,
        planned: {
          carbsGrams: 127.5,
          fatGrams: 51,
          kcal: 1_275,
          proteinGrams: 127.5,
        },
        target: {
          carbsGrams: 127.5,
          fatGrams: 51,
          kcal: 1_275,
          proteinGrams: 127.5,
        },
      },
    ]);
    expect(first.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'DAILY_MACROS_OUTSIDE_TARGET' }),
    );
  });

  it('uses five distinct dinners and avoids recent dinners when equivalents exist', () => {
    const dinners = Array.from({ length: 8 }, (_, index) =>
      recipe(index + 10, `Dinner ${index + 1}`, 'dinner', dinnerNutrition),
    );
    const plan = generateWeeklyPlan(
      planningInput([breakfast, lunch, ...dinners], [dinners[0]!.id]),
    );
    const plannedDinners = plan.days.map(
      ({ slots }) => slots.find(({ mealType }) => mealType === 'dinner')!.meal!,
    );

    expect(
      new Set(plannedDinners.map(({ recipeId }) => recipeId)).size,
    ).toBeGreaterThanOrEqual(5);
    expect(
      plannedDinners.filter(({ recipeId }) => recipeId === dinners[0]!.id),
    ).toHaveLength(0);
  });

  it('handles a 222-recipe library without candidate-score explosion', () => {
    const recipes = Array.from({ length: 222 }, (_, index) =>
      recipe(index + 100, `Recipe ${index + 1}`, 'breakfast', dinnerNutrition, {
        ingredients: Array.from(
          { length: 12 },
          (_, ingredient) => `ingredient ${index}-${ingredient}`,
        ),
        mealTypes: ['breakfast', 'lunch', 'dinner'],
      }),
    );

    const plan = generateWeeklyPlan(planningInput(recipes));
    const reordered = generateWeeklyPlan(planningInput([...recipes].reverse()));

    expect(reordered).toEqual(plan);
    expect(plan.days).toHaveLength(7);
    expect(plan.days.every(({ slots }) => slots.length === 3)).toBe(true);
  });

  it('returns the best draft with honest diagnostics when constraints conflict', () => {
    const onlyDinner = recipe(10, 'Only dinner', 'dinner', dinnerNutrition, {
      nutritionConfidence: 'low',
    });
    const plan = generateWeeklyPlan(planningInput([onlyDinner]));

    expect(plan.days[0]?.slots.map(({ meal }) => meal === null)).toEqual([
      true,
      true,
      false,
    ]);
    expect(plan.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'MEAL_TYPE_UNAVAILABLE',
        'DINNER_VARIETY_LOW',
        'DINNER_REPEATED',
        'DAILY_MACROS_OUTSIDE_TARGET',
        'LOW_CONFIDENCE_NUTRITION',
      ]),
    );
  });

  it('rejects a week that does not start on Monday', () => {
    expect(() =>
      generateWeeklyPlan({
        ...planningInput([breakfast, lunch]),
        weekStart: '2026-08-25',
      }),
    ).toThrow('Week start must be a Monday');
  });
});
