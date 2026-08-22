import type { MealType, RecipeNutrition } from '@macromap/contracts';

const daysPerWeek = 7;
const mealTypes: readonly MealType[] = ['breakfast', 'lunch', 'dinner'];
const mealShares: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.3,
  dinner: 0.45,
};
const partialDayShares = [0, mealShares.breakfast, 1 - mealShares.dinner];
const variationTargets: Record<
  MealType,
  { readonly minimumDistinct: number; readonly maximumUses: number }
> = {
  breakfast: { minimumDistinct: 3, maximumUses: 3 },
  lunch: { minimumDistinct: 4, maximumUses: 2 },
  dinner: { minimumDistinct: 5, maximumUses: 2 },
};
const servingOptions = [0.25, 0.5, 0.75, 1];
const beamWidth = 80;
const noRecipeIds: ReadonlySet<string> = new Set();

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
  | 'BREAKFAST_REPEATED'
  | 'BREAKFAST_VARIETY_LOW'
  | 'DAILY_MACROS_OUTSIDE_TARGET'
  | 'DINNER_REPEATED'
  | 'DINNER_VARIETY_LOW'
  | 'LUNCH_REPEATED'
  | 'LUNCH_VARIETY_LOW'
  | 'LOW_CONFIDENCE_NUTRITION'
  | 'MEAL_TYPE_UNAVAILABLE'
  | 'SAME_DAY_REPEATED';

export interface PlanningDiagnostic {
  readonly code: PlanningDiagnosticCode;
  readonly message: string;
}

const variationDiagnosticCodes: Record<
  MealType,
  {
    readonly repeated: PlanningDiagnosticCode;
    readonly variety: PlanningDiagnosticCode;
  }
> = {
  breakfast: {
    repeated: 'BREAKFAST_REPEATED',
    variety: 'BREAKFAST_VARIETY_LOW',
  },
  lunch: { repeated: 'LUNCH_REPEATED', variety: 'LUNCH_VARIETY_LOW' },
  dinner: { repeated: 'DINNER_REPEATED', variety: 'DINNER_VARIETY_LOW' },
};

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

interface MacroScore {
  readonly guardrail: number;
  readonly preference: number;
}

interface PlanState {
  readonly breakfastLunchRepetition: number;
  readonly completedMacroGuardrail: number;
  readonly completedMacroPreference: number;
  readonly currentDayRecipeIds: ReadonlySet<string>;
  readonly dinnerRepetition: number;
  readonly flavourRepetition: number;
  readonly historyPenalty: number;
  readonly ingredientReuse: number;
  readonly lastMealByType: Readonly<Record<MealType, Candidate | null>>;
  readonly mealCountsByType: Readonly<
    Record<MealType, ReadonlyMap<string, number>>
  >;
  readonly meals: ReadonlyArray<Candidate | null>;
  readonly sameDayRepetition: number;
  readonly tieBreaker: number;
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
  const variedPlan = search(input, candidates, recentDinnerIds, true);
  const winner =
    variedPlan.completedMacroGuardrail === 0
      ? variedPlan
      : betterMacroPlan(
          variedPlan,
          search(input, candidates, recentDinnerIds, false),
        );

  const days = buildDays(winner, input);
  return {
    days,
    diagnostics: buildDiagnostics(days, winner, input),
    seed: input.weekStart,
    weekStart: input.weekStart,
  };
}

function search(
  input: WeeklyPlanningInput,
  candidates: ReadonlyMap<MealType, ReadonlyArray<Candidate>>,
  recentDinnerIds: ReadonlySet<string>,
  enforceVariation: boolean,
): PlanState {
  let states: ReadonlyArray<PlanState> = [emptyState()];

  for (
    let slotIndex = 0;
    slotIndex < daysPerWeek * mealTypes.length;
    slotIndex += 1
  ) {
    const mealType = mealTypes[slotIndex % mealTypes.length]!;
    const options = candidates.get(mealType)!;
    const expanded = states.flatMap((state) => {
      const mealOptions: ReadonlyArray<Candidate | null> =
        options.length === 0
          ? [null]
          : availableCandidates(state, options, mealType, enforceVariation);
      return mealOptions.map((candidate) => {
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
      });
    });
    states = expanded
      .sort((left, right) => compareScores(left.score, right.score))
      .slice(0, beamWidth)
      .map(({ candidate, state }) => commitMeal(state, candidate, mealType));
  }

  return states[0] ?? emptyState();
}

function availableCandidates(
  state: PlanState,
  candidates: ReadonlyArray<Candidate>,
  mealType: MealType,
  enforceVariation: boolean,
): ReadonlyArray<Candidate> {
  if (!enforceVariation) return candidates;

  const varied = candidates.filter((candidate) =>
    keepsVariationPossible(state, candidate, mealType, candidates.length),
  );
  const recipesUsedToday =
    mealType === 'breakfast' ? noRecipeIds : state.currentDayRecipeIds;
  const notUsedToday = (candidate: Candidate) =>
    !recipesUsedToday.has(candidate.recipe.id);
  const variedAndNewToday = varied.filter(notUsedToday);

  if (variedAndNewToday.length > 0) return variedAndNewToday;

  const newToday = candidates.filter(notUsedToday);
  if (newToday.length > 0) return newToday;
  return varied.length > 0 ? varied : candidates;
}

function keepsVariationPossible(
  state: PlanState,
  candidate: Candidate,
  mealType: MealType,
  candidateCount: number,
): boolean {
  const counts = state.mealCountsByType[mealType];
  const previousUses = counts.get(candidate.recipe.id) ?? 0;
  const target = variationTargets[mealType];
  const maximumUses = Math.max(
    target.maximumUses,
    Math.ceil(daysPerWeek / candidateCount),
  );
  if (previousUses >= maximumUses) return false;

  const completedSlots = Math.floor(state.meals.length / mealTypes.length);
  const remainingSlots = daysPerWeek - completedSlots - 1;
  const distinctAfterSelection = counts.size + (previousUses === 0 ? 1 : 0);
  const minimumDistinct = Math.min(target.minimumDistinct, candidateCount);
  return distinctAfterSelection + remainingSlots >= minimumDistinct;
}

function betterMacroPlan(
  variedPlan: PlanState,
  relaxedPlan: PlanState,
): PlanState {
  return variedPlan.completedMacroGuardrail <=
    relaxedPlan.completedMacroGuardrail
    ? variedPlan
    : relaxedPlan;
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
          planningTarget(person.macroTargets, input.snackReserve),
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
      ...portionMacroScore(nutrition, dailyTarget, mealShare, left),
      left,
    ];
    const rightScore = [
      ...portionMacroScore(nutrition, dailyTarget, mealShare, right),
      right,
    ];
    return compareScores(leftScore, rightScore);
  })[0]!;
}

function portionMacroScore(
  nutrition: RecipeNutrition,
  dailyTarget: RecipeNutrition,
  mealShare: number,
  servings: number,
): ReadonlyArray<number> {
  const target = scaleMacros(dailyTarget, mealShare);
  const actual = scaleMacros(nutrition, servings);
  const score = evaluateMacros(actual, target);
  return [score.guardrail, score.preference];
}

function proposeMeal(
  state: PlanState,
  candidate: Candidate | null,
  mealType: MealType,
  input: WeeklyPlanningInput,
  recentDinnerIds: ReadonlySet<string>,
): PlanState {
  const currentDayRecipeIds =
    mealType === 'breakfast' ? noRecipeIds : state.currentDayRecipeIds;
  const previousMeal = state.lastMealByType[mealType];
  const previousUses =
    candidate === null
      ? 0
      : (state.mealCountsByType[mealType].get(candidate.recipe.id) ?? 0);
  const proposed: PlanState = {
    breakfastLunchRepetition:
      state.breakfastLunchRepetition +
      (candidate !== null &&
      mealType !== 'dinner' &&
      previousUses >= variationTargets[mealType].maximumUses
        ? 1
        : 0),
    completedMacroGuardrail: state.completedMacroGuardrail,
    completedMacroPreference: state.completedMacroPreference,
    currentDayRecipeIds,
    dinnerRepetition:
      state.dinnerRepetition +
      (candidate !== null && mealType === 'dinner' && previousUses > 0 ? 1 : 0),
    flavourRepetition:
      state.flavourRepetition +
      (candidate !== null && previousMeal !== null
        ? mealSimilarity(previousMeal, candidate)
        : 0),
    historyPenalty:
      state.historyPenalty +
      (candidate !== null &&
      mealType === 'dinner' &&
      recentDinnerIds.has(candidate.recipe.id)
        ? 1
        : 0),
    ingredientReuse:
      state.ingredientReuse +
      (candidate?.ingredientKeys.filter((ingredient) =>
        state.usedIngredients.has(ingredient),
      ).length ?? 0),
    lastMealByType: state.lastMealByType,
    mealCountsByType: state.mealCountsByType,
    meals: [...state.meals, candidate],
    sameDayRepetition:
      state.sameDayRepetition +
      (candidate !== null && currentDayRecipeIds.has(candidate.recipe.id)
        ? 1
        : 0),
    tieBreaker:
      state.tieBreaker +
      (candidate === null
        ? 0
        : stableHash(`${state.meals.length}:${candidate.recipe.id}`)),
    usedIngredients: state.usedIngredients,
  };
  if (mealType !== 'dinner') return proposed;

  const macroScore = dayMacroScore(
    proposed,
    input,
    Math.floor(state.meals.length / mealTypes.length),
    1,
  );
  return {
    ...proposed,
    completedMacroGuardrail:
      state.completedMacroGuardrail + macroScore.guardrail,
    completedMacroPreference:
      state.completedMacroPreference + macroScore.preference,
  };
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
  const mealCounts = new Map(state.mealCountsByType[mealType]);
  mealCounts.set(
    candidate.recipe.id,
    (mealCounts.get(candidate.recipe.id) ?? 0) + 1,
  );
  const currentDayRecipeIds =
    mealType === 'dinner'
      ? state.currentDayRecipeIds
      : new Set(state.currentDayRecipeIds).add(candidate.recipe.id);
  return {
    ...state,
    currentDayRecipeIds,
    lastMealByType: { ...state.lastMealByType, [mealType]: candidate },
    mealCountsByType: {
      ...state.mealCountsByType,
      [mealType]: mealCounts,
    },
    usedIngredients,
  };
}

function emptyState(): PlanState {
  return {
    breakfastLunchRepetition: 0,
    completedMacroGuardrail: 0,
    completedMacroPreference: 0,
    currentDayRecipeIds: noRecipeIds,
    dinnerRepetition: 0,
    flavourRepetition: 0,
    historyPenalty: 0,
    ingredientReuse: 0,
    lastMealByType: { breakfast: null, dinner: null, lunch: null },
    mealCountsByType: {
      breakfast: new Map(),
      dinner: new Map(),
      lunch: new Map(),
    },
    meals: [],
    sameDayRepetition: 0,
    tieBreaker: 0,
    usedIngredients: new Set(),
  };
}

function scoreState(
  state: PlanState,
  input: WeeklyPlanningInput,
): ReadonlyArray<number> {
  const mealsIntoCurrentDay = state.meals.length % mealTypes.length;
  let macroGuardrail = state.completedMacroGuardrail;
  let macroPreference = state.completedMacroPreference;
  if (mealsIntoCurrentDay > 0) {
    const partialMacroScore = dayMacroScore(
      state,
      input,
      Math.floor((state.meals.length - 1) / mealTypes.length),
      partialDayShares[mealsIntoCurrentDay]!,
    );
    macroGuardrail += partialMacroScore.guardrail;
    macroPreference += partialMacroScore.preference;
  }
  return [
    roundScore(macroGuardrail),
    state.sameDayRepetition,
    state.dinnerRepetition,
    state.breakfastLunchRepetition,
    state.flavourRepetition,
    state.historyPenalty,
    roundScore(macroPreference),
    -state.ingredientReuse,
    state.tieBreaker,
  ];
}

function dayMacroScore(
  state: PlanState,
  input: WeeklyPlanningInput,
  dayIndex: number,
  targetShare: number,
): MacroScore {
  const dayMeals = state.meals.slice(
    dayIndex * mealTypes.length,
    dayIndex * mealTypes.length + mealTypes.length,
  );
  return input.people.reduce(
    (total, person) => {
      const planned = sumPersonMacros(dayMeals, person.id);
      const target = scaleMacros(
        planningTarget(person.macroTargets, input.snackReserve),
        targetShare,
      );
      const score = evaluateMacros(planned, target);
      return {
        guardrail: total.guardrail + score.guardrail,
        preference: total.preference + score.preference,
      };
    },
    { guardrail: 0, preference: 0 },
  );
}

function evaluateMacros(
  actual: RecipeNutrition,
  target: RecipeNutrition,
): MacroScore {
  const kcal = safeRatio(actual.kcal, target.kcal);
  const protein = safeRatio(actual.proteinGrams, target.proteinGrams);
  const carbs = safeRatio(actual.carbsGrams, target.carbsGrams);
  const fat = safeRatio(actual.fatGrams, target.fatGrams);
  return {
    guardrail:
      outsideRange(kcal, 0.9, 1.1) +
      Math.max(0, 0.9 - protein) +
      outsideRange(carbs, 0.7, 1.1) +
      outsideRange(fat, 0.7, 1.1),
    preference: Math.abs(kcal - 1) + Math.max(0, 1 - protein),
  };
}

function outsideRange(ratio: number, minimum: number, maximum: number): number {
  return Math.max(0, minimum - ratio, ratio - maximum);
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
          planningTarget(person.macroTargets, input.snackReserve),
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

  const repeatedDates = days.flatMap((day) => {
    const recipeIds = day.slots.flatMap(({ meal }) =>
      meal === null ? [] : [meal.recipeId],
    );
    return new Set(recipeIds).size < recipeIds.length ? [day.date] : [];
  });
  if (repeatedDates.length > 0) {
    diagnostics.push({
      code: 'SAME_DAY_REPEATED',
      message: `The same recipe appears in multiple meal slots on ${repeatedDates.join(', ')}.`,
    });
  }

  for (const mealType of mealTypes) {
    addVariationDiagnostics(diagnostics, days, input, mealType);
  }

  for (const person of input.people) {
    const dates = days.flatMap((day) => {
      const macros = day.macros.find(({ personId }) => personId === person.id);
      return macros !== undefined &&
        evaluateMacros(macros.planned, macros.target).guardrail > 0
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

function addVariationDiagnostics(
  diagnostics: PlanningDiagnostic[],
  days: ReadonlyArray<PlannedDay>,
  input: WeeklyPlanningInput,
  mealType: MealType,
): void {
  const recipeIds = days
    .flatMap(({ slots }) => slots)
    .filter((slot) => slot.mealType === mealType)
    .flatMap(({ meal }) => (meal === null ? [] : [meal.recipeId]));
  const counts = countBy(recipeIds);
  const target = variationTargets[mealType];
  const codes = variationDiagnosticCodes[mealType];
  if (counts.size < Math.min(target.minimumDistinct, recipeIds.length)) {
    diagnostics.push({
      code: codes.variety,
      message: `The draft contains ${counts.size} distinct ${mealType} recipes; the target is ${target.minimumDistinct}.`,
    });
  }
  const repeated = [...counts.entries()].find(
    ([, count]) => count > target.maximumUses,
  );
  if (repeated !== undefined) {
    const recipe = input.recipes.find(({ id }) => id === repeated[0]);
    diagnostics.push({
      code: codes.repeated,
      message: `${recipe?.title ?? `A ${mealType}`} appears ${repeated[1]} times at ${mealType}; the normal maximum is ${target.maximumUses}.`,
    });
  }
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

function planningTarget(
  target: RecipeNutrition,
  snackReserve: number,
): RecipeNutrition {
  return { ...target, kcal: target.kcal * (1 - snackReserve) };
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

function mealSimilarity(previous: Candidate, current: Candidate): number {
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
