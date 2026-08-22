import type { MealType, RecipeNutrition } from '@macromap/contracts';

const daysPerWeek = 7;
const mealTypes: readonly MealType[] = ['breakfast', 'lunch', 'dinner'];
const mealShares: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.3,
  dinner: 0.45,
};
const partialDayShares = [0, mealShares.breakfast, 1 - mealShares.dinner];
const servingOptions = [0.5, 0.75, 1, 1.25, 1.5];
const beamWidth = 80;

export interface PlanningPerson {
  readonly displayName: string;
  readonly id: string;
  readonly macroTargets: RecipeNutrition;
}

export interface PlanningRecipe {
  readonly id: string;
  readonly ingredients: ReadonlyArray<string>;
  readonly mealTypes: ReadonlyArray<MealType>;
  readonly nutrition: RecipeNutrition;
  readonly nutritionConfidence: 'confirmed' | 'high' | 'medium' | 'low';
  readonly tags: {
    readonly cuisines: ReadonlyArray<string>;
    readonly flavours: ReadonlyArray<string>;
    readonly proteins: ReadonlyArray<string>;
  };
  readonly title: string;
}

export interface PlannedPortion {
  readonly personId: string;
  readonly servings: number;
}

export interface PlannedMeal {
  readonly batchServings: number;
  readonly portions: ReadonlyArray<PlannedPortion>;
  readonly recipeId: string;
  readonly recipeTitle: string;
}

export interface PlannedDay {
  readonly date: string;
  readonly macros: ReadonlyArray<{
    readonly personId: string;
    readonly planned: RecipeNutrition;
    readonly target: RecipeNutrition;
  }>;
  readonly slots: ReadonlyArray<{
    readonly meal: PlannedMeal | null;
    readonly mealType: MealType;
  }>;
}

export type PlanningDiagnosticCode =
  | 'DAILY_MACROS_OUTSIDE_TARGET'
  | 'DINNER_REPEATED'
  | 'DINNER_VARIETY_LOW'
  | 'LOW_CONFIDENCE_NUTRITION'
  | 'MEAL_TYPE_UNAVAILABLE';

export interface PlanningDiagnostic {
  readonly code: PlanningDiagnosticCode;
  readonly message: string;
}

export interface GeneratedWeeklyPlan {
  readonly days: ReadonlyArray<PlannedDay>;
  readonly diagnostics: ReadonlyArray<PlanningDiagnostic>;
  readonly seed: string;
  readonly weekStart: string;
}

export interface WeeklyPlanningInput {
  readonly people: ReadonlyArray<PlanningPerson>;
  readonly recentDinnerRecipeIds: ReadonlyArray<string>;
  readonly recipes: ReadonlyArray<PlanningRecipe>;
  readonly snackReserve: number;
  readonly weekStart: string;
}

interface Candidate {
  readonly ingredientKeys: ReadonlyArray<string>;
  readonly meal: PlannedMeal;
  readonly recipe: PlanningRecipe;
  readonly tagKeys: {
    readonly cuisines: NormalisedValues;
    readonly flavours: NormalisedValues;
    readonly proteins: NormalisedValues;
  };
}

interface NormalisedValues {
  readonly all: ReadonlyArray<string>;
  readonly unique: ReadonlySet<string>;
}

interface PlanState {
  readonly completedMacroPenalty: number;
  readonly dinnerRepetition: number;
  readonly flavourRepetition: number;
  readonly historyPenalty: number;
  readonly ingredientReuse: number;
  readonly lastDinner: Candidate | null;
  readonly meals: ReadonlyArray<Candidate | null>;
  readonly tieBreaker: number;
  readonly usedDinnerIds: ReadonlySet<string>;
  readonly usedIngredients: ReadonlySet<string>;
}

export function generateWeeklyPlan(
  input: WeeklyPlanningInput,
): GeneratedWeeklyPlan {
  validateInput(input);

  const candidates = new Map(
    mealTypes.map((mealType) => [mealType, createCandidates(input, mealType)]),
  );
  const recentDinnerIds = new Set(input.recentDinnerRecipeIds);
  let states: ReadonlyArray<PlanState> = [emptyState()];

  for (
    let slotIndex = 0;
    slotIndex < daysPerWeek * mealTypes.length;
    slotIndex += 1
  ) {
    const mealType = mealTypes[slotIndex % mealTypes.length]!;
    const options = candidates.get(mealType)!;
    const mealOptions: ReadonlyArray<Candidate | null> =
      options.length === 0 ? [null] : options;
    const expanded = states.flatMap((state) =>
      mealOptions.map((candidate) => {
        const proposed = proposeMeal(
          state,
          candidate,
          mealType,
          input,
          recentDinnerIds,
        );
        return {
          candidate,
          score: scoreState(proposed, input),
          state: proposed,
        };
      }),
    );
    states = expanded
      .sort((left, right) => compareScores(left.score, right.score))
      .slice(0, beamWidth)
      .map(({ candidate, state }) => commitMeal(state, candidate, mealType));
  }

  const winner = states[0] ?? emptyState();
  const days = buildDays(winner, input);
  return {
    days,
    diagnostics: buildDiagnostics(days, winner, input),
    seed: input.weekStart,
    weekStart: input.weekStart,
  };
}

function validateInput(input: WeeklyPlanningInput): void {
  const weekStart = new Date(`${input.weekStart}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(input.weekStart) ||
    Number.isNaN(weekStart.valueOf()) ||
    weekStart.toISOString().slice(0, 10) !== input.weekStart ||
    weekStart.getUTCDay() !== 1
  ) {
    throw new RangeError('Week start must be a Monday in YYYY-MM-DD format.');
  }
  if (input.people.length === 0) {
    throw new RangeError('At least one planning profile is required.');
  }
  if (input.snackReserve < 0 || input.snackReserve >= 1) {
    throw new RangeError('Snack reserve must be at least 0 and less than 1.');
  }
}

function createCandidates(
  input: WeeklyPlanningInput,
  mealType: MealType,
): ReadonlyArray<Candidate> {
  return input.recipes
    .filter((recipe) => recipe.mealTypes.includes(mealType))
    .map((recipe) => {
      const portions = input.people.map((person) => ({
        personId: person.id,
        servings: chooseServingSize(
          recipe.nutrition,
          plannedTarget(person.macroTargets, input.snackReserve),
          mealShares[mealType],
        ),
      }));
      return {
        ingredientKeys: [...new Set(recipe.ingredients.map(normalise))],
        meal: {
          batchServings: portions.reduce(
            (total, portion) => total + portion.servings,
            0,
          ),
          portions,
          recipeId: recipe.id,
          recipeTitle: recipe.title,
        },
        recipe,
        tagKeys: {
          cuisines: normaliseValues(recipe.tags.cuisines),
          flavours: normaliseValues(recipe.tags.flavours),
          proteins: normaliseValues(recipe.tags.proteins),
        },
      };
    })
    .sort(
      (left, right) =>
        stableHash(`${input.weekStart}:${left.recipe.id}`) -
        stableHash(`${input.weekStart}:${right.recipe.id}`),
    );
}

function chooseServingSize(
  nutrition: RecipeNutrition,
  dailyTarget: RecipeNutrition,
  mealShare: number,
): number {
  return [...servingOptions].sort((left, right) => {
    const leftScore = [
      portionMacroDistance(nutrition, dailyTarget, mealShare, left),
      left,
    ];
    const rightScore = [
      portionMacroDistance(nutrition, dailyTarget, mealShare, right),
      right,
    ];
    return compareScores(leftScore, rightScore);
  })[0]!;
}

function portionMacroDistance(
  nutrition: RecipeNutrition,
  dailyTarget: RecipeNutrition,
  mealShare: number,
  servings: number,
): number {
  const target = scaleMacros(dailyTarget, mealShare);
  const actual = scaleMacros(nutrition, servings);
  return (
    relativeDifference(actual.kcal, target.kcal) +
    relativeDifference(actual.carbsGrams, target.carbsGrams) +
    relativeDifference(actual.fatGrams, target.fatGrams) +
    2 * relativeDifference(actual.proteinGrams, target.proteinGrams)
  );
}

function proposeMeal(
  state: PlanState,
  candidate: Candidate | null,
  mealType: MealType,
  input: WeeklyPlanningInput,
  recentDinnerIds: ReadonlySet<string>,
): PlanState {
  const dinner = mealType === 'dinner' ? candidate : null;
  const proposed: PlanState = {
    completedMacroPenalty: state.completedMacroPenalty,
    dinnerRepetition:
      state.dinnerRepetition +
      (dinner !== null && state.usedDinnerIds.has(dinner.recipe.id) ? 1 : 0),
    flavourRepetition:
      state.flavourRepetition +
      (dinner !== null && state.lastDinner !== null
        ? dinnerSimilarity(state.lastDinner, dinner)
        : 0),
    historyPenalty:
      state.historyPenalty +
      (dinner !== null && recentDinnerIds.has(dinner.recipe.id) ? 1 : 0),
    ingredientReuse:
      state.ingredientReuse +
      (candidate?.ingredientKeys.filter((ingredient) =>
        state.usedIngredients.has(ingredient),
      ).length ?? 0),
    lastDinner: dinner ?? state.lastDinner,
    meals: [...state.meals, candidate],
    tieBreaker:
      state.tieBreaker +
      (candidate === null
        ? 0
        : stableHash(`${state.meals.length}:${candidate.recipe.id}`)),
    usedDinnerIds: state.usedDinnerIds,
    usedIngredients: state.usedIngredients,
  };
  return mealType === 'dinner'
    ? {
        ...proposed,
        completedMacroPenalty:
          state.completedMacroPenalty +
          dayMacroPenalty(
            proposed,
            input,
            Math.floor(state.meals.length / mealTypes.length),
            1,
          ),
      }
    : proposed;
}

function commitMeal(
  state: PlanState,
  candidate: Candidate | null,
  mealType: MealType,
): PlanState {
  if (candidate === null) return state;
  const usedIngredients = new Set(state.usedIngredients);
  for (const ingredient of candidate.ingredientKeys) {
    usedIngredients.add(ingredient);
  }
  const usedDinnerIds =
    mealType === 'dinner'
      ? new Set(state.usedDinnerIds).add(candidate.recipe.id)
      : state.usedDinnerIds;
  return { ...state, usedDinnerIds, usedIngredients };
}

function emptyState(): PlanState {
  return {
    completedMacroPenalty: 0,
    dinnerRepetition: 0,
    flavourRepetition: 0,
    historyPenalty: 0,
    ingredientReuse: 0,
    lastDinner: null,
    meals: [],
    tieBreaker: 0,
    usedDinnerIds: new Set(),
    usedIngredients: new Set(),
  };
}

function scoreState(
  state: PlanState,
  input: WeeklyPlanningInput,
): ReadonlyArray<number> {
  const mealsIntoCurrentDay = state.meals.length % mealTypes.length;
  let macroPenalty = state.completedMacroPenalty;
  if (mealsIntoCurrentDay > 0) {
    macroPenalty += dayMacroPenalty(
      state,
      input,
      Math.floor((state.meals.length - 1) / mealTypes.length),
      partialDayShares[mealsIntoCurrentDay]!,
    );
  }
  return [
    roundScore(macroPenalty),
    state.dinnerRepetition,
    state.flavourRepetition,
    state.historyPenalty,
    -state.ingredientReuse,
    state.tieBreaker,
  ];
}

function dayMacroPenalty(
  state: PlanState,
  input: WeeklyPlanningInput,
  dayIndex: number,
  targetShare: number,
): number {
  const dayMeals = state.meals.slice(
    dayIndex * mealTypes.length,
    dayIndex * mealTypes.length + mealTypes.length,
  );
  return input.people.reduce((total, person) => {
    const planned = sumPersonMacros(dayMeals, person.id);
    const target = scaleMacros(
      plannedTarget(person.macroTargets, input.snackReserve),
      targetShare,
    );
    return total + macroBandPenalty(planned, target);
  }, 0);
}

function macroBandPenalty(
  actual: RecipeNutrition,
  target: RecipeNutrition,
): number {
  return (
    outsideTolerance(actual.kcal, target.kcal, 0.1) +
    outsideTolerance(actual.carbsGrams, target.carbsGrams, 0.15) +
    outsideTolerance(actual.fatGrams, target.fatGrams, 0.15) +
    Math.max(0, 1 - safeRatio(actual.proteinGrams, target.proteinGrams))
  );
}

function outsideTolerance(
  actual: number,
  target: number,
  tolerance: number,
): number {
  return Math.max(0, Math.abs(safeRatio(actual, target) - 1) - tolerance);
}

function safeRatio(actual: number, target: number): number {
  return target === 0 ? (actual === 0 ? 1 : actual + 1) : actual / target;
}

function buildDays(
  state: PlanState,
  input: WeeklyPlanningInput,
): ReadonlyArray<PlannedDay> {
  return Array.from({ length: daysPerWeek }, (_, dayIndex) => {
    const dayMeals = state.meals.slice(
      dayIndex * mealTypes.length,
      (dayIndex + 1) * mealTypes.length,
    );
    return {
      date: addDays(input.weekStart, dayIndex),
      macros: input.people.map((person) => ({
        personId: person.id,
        planned: roundMacros(sumPersonMacros(dayMeals, person.id)),
        target: roundMacros(
          plannedTarget(person.macroTargets, input.snackReserve),
        ),
      })),
      slots: mealTypes.map((mealType, mealIndex) => ({
        meal: dayMeals[mealIndex]?.meal ?? null,
        mealType,
      })),
    };
  });
}

function buildDiagnostics(
  days: ReadonlyArray<PlannedDay>,
  state: PlanState,
  input: WeeklyPlanningInput,
): ReadonlyArray<PlanningDiagnostic> {
  const diagnostics: PlanningDiagnostic[] = [];
  for (const mealType of mealTypes) {
    if (!input.recipes.some((recipe) => recipe.mealTypes.includes(mealType))) {
      diagnostics.push({
        code: 'MEAL_TYPE_UNAVAILABLE',
        message: `No planning-ready ${mealType} recipe is available, so those slots are empty.`,
      });
    }
  }

  const dinnerIds = days
    .flatMap(({ slots }) => slots)
    .filter(({ mealType }) => mealType === 'dinner')
    .flatMap(({ meal }) => (meal === null ? [] : [meal.recipeId]));
  const dinnerCounts = countBy(dinnerIds);
  if (dinnerCounts.size < Math.min(5, dinnerIds.length)) {
    diagnostics.push({
      code: 'DINNER_VARIETY_LOW',
      message: `The draft contains ${dinnerCounts.size} distinct dinners; the target is five.`,
    });
  }
  const repeatedDinner = [...dinnerCounts.entries()].find(
    ([, count]) => count > 2,
  );
  if (repeatedDinner !== undefined) {
    const recipe = input.recipes.find(({ id }) => id === repeatedDinner[0]);
    diagnostics.push({
      code: 'DINNER_REPEATED',
      message: `${recipe?.title ?? 'A dinner'} appears ${repeatedDinner[1]} times.`,
    });
  }

  for (const person of input.people) {
    const dates = days.flatMap((day) => {
      const macros = day.macros.find(({ personId }) => personId === person.id);
      return macros !== undefined &&
        macroBandPenalty(macros.planned, macros.target) > 0
        ? [day.date]
        : [];
    });
    if (dates.length > 0) {
      diagnostics.push({
        code: 'DAILY_MACROS_OUTSIDE_TARGET',
        message: `${person.displayName} is outside the daily macro range on ${dates.join(', ')}.`,
      });
    }
  }

  const lowConfidenceRecipes = new Set(
    state.meals.flatMap((meal) =>
      meal?.recipe.nutritionConfidence === 'low' ? [meal.recipe.title] : [],
    ),
  );
  if (lowConfidenceRecipes.size > 0) {
    diagnostics.push({
      code: 'LOW_CONFIDENCE_NUTRITION',
      message: `Low-confidence nutrition was used for: ${[...lowConfidenceRecipes].join(', ')}.`,
    });
  }
  return diagnostics;
}

function sumPersonMacros(
  meals: ReadonlyArray<Candidate | null>,
  personId: string,
): RecipeNutrition {
  return meals.reduce<RecipeNutrition>((total, candidate) => {
    if (candidate === null) return total;
    const servings = candidate.meal.portions.find(
      (portion) => portion.personId === personId,
    )?.servings;
    if (servings === undefined) return total;
    return addMacros(total, scaleMacros(candidate.recipe.nutrition, servings));
  }, emptyMacros());
}

function plannedTarget(
  target: RecipeNutrition,
  snackReserve: number,
): RecipeNutrition {
  return scaleMacros(target, 1 - snackReserve);
}

function emptyMacros(): RecipeNutrition {
  return { carbsGrams: 0, fatGrams: 0, kcal: 0, proteinGrams: 0 };
}

function addMacros(
  left: RecipeNutrition,
  right: RecipeNutrition,
): RecipeNutrition {
  return {
    carbsGrams: left.carbsGrams + right.carbsGrams,
    fatGrams: left.fatGrams + right.fatGrams,
    kcal: left.kcal + right.kcal,
    proteinGrams: left.proteinGrams + right.proteinGrams,
  };
}

function scaleMacros(macros: RecipeNutrition, factor: number): RecipeNutrition {
  return {
    carbsGrams: macros.carbsGrams * factor,
    fatGrams: macros.fatGrams * factor,
    kcal: macros.kcal * factor,
    proteinGrams: macros.proteinGrams * factor,
  };
}

function roundMacros(macros: RecipeNutrition): RecipeNutrition {
  return {
    carbsGrams: round(macros.carbsGrams),
    fatGrams: round(macros.fatGrams),
    kcal: round(macros.kcal),
    proteinGrams: round(macros.proteinGrams),
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function relativeDifference(actual: number, target: number): number {
  return Math.abs(safeRatio(actual, target) - 1);
}

function dinnerSimilarity(previous: Candidate, current: Candidate): number {
  return (
    overlap(previous.tagKeys.cuisines, current.tagKeys.cuisines) +
    overlap(previous.tagKeys.flavours, current.tagKeys.flavours) +
    overlap(previous.tagKeys.proteins, current.tagKeys.proteins)
  );
}

function overlap(left: NormalisedValues, right: NormalisedValues): number {
  return left.all.filter((value) => right.unique.has(value)).length;
}

function normaliseValues(values: ReadonlyArray<string>): NormalisedValues {
  const all = values.map(normalise);
  return { all, unique: new Set(all) };
}

function normalise(value: string): string {
  return value.trim().toLocaleLowerCase('en-GB');
}

function countBy(values: ReadonlyArray<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function compareScores(
  left: ReadonlyArray<number>,
  right: ReadonlyArray<number>,
): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function roundScore(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0)!;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
