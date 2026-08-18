import type {
  MealType,
  RecipeImportDraft,
  RecipeImportWarning,
  RecipeIngredient,
  RecipeNutrition,
  RecipeNutritionProvenance,
  RecipeSource,
} from '@macromap/contracts';
import {
  describeNutritionEstimationIssue,
  estimateRecipeNutrition,
} from '@macromap/domain/nutrition';

export type SchemaOrgRecipeResult =
  | {
      readonly candidates: ReadonlyArray<{
        readonly index: number;
        readonly title: string;
      }>;
      readonly kind: 'selection';
    }
  | {
      readonly code: 'INVALID_JSON' | 'INVALID_SELECTION' | 'NO_RECIPE';
      readonly kind: 'error';
      readonly message: string;
    }
  | {
      readonly draft: RecipeImportDraft;
      readonly kind: 'preview';
      readonly warnings: ReadonlyArray<RecipeImportWarning>;
    };

type JsonObject = Record<string, unknown>;

const unitNames = new Map(
  Object.entries({
    bottle: 'bottle',
    bottles: 'bottle',
    bunch: 'bunch',
    bunches: 'bunch',
    can: 'can',
    cans: 'can',
    clove: 'clove',
    cloves: 'clove',
    cup: 'cup',
    cups: 'cup',
    g: 'g',
    gram: 'g',
    grams: 'g',
    kg: 'kg',
    kilogram: 'kg',
    kilograms: 'kg',
    l: 'l',
    liter: 'l',
    liters: 'l',
    litre: 'l',
    litres: 'l',
    lb: 'lb',
    lbs: 'lb',
    ml: 'ml',
    ounce: 'oz',
    ounces: 'oz',
    oz: 'oz',
    packet: 'packet',
    packets: 'packet',
    pinch: 'pinch',
    pinches: 'pinch',
    slice: 'slice',
    slices: 'slice',
    tbsp: 'tbsp',
    tablespoon: 'tbsp',
    tablespoons: 'tbsp',
    tin: 'tin',
    tins: 'tin',
    tsp: 'tsp',
    teaspoon: 'tsp',
    teaspoons: 'tsp',
  }),
);

const unicodeFractions: Readonly<Record<string, number>> = {
  '¼': 1 / 4,
  '½': 1 / 2,
  '¾': 3 / 4,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};

export function parseSchemaOrgRecipe(
  content: string,
  recipeIndex?: number,
  sourceUrl?: string,
): SchemaOrgRecipeResult {
  let document: unknown;
  try {
    document = JSON.parse(content);
  } catch {
    return {
      code: 'INVALID_JSON',
      kind: 'error',
      message: 'That content is not valid JSON.',
    };
  }

  const recipes = findRecipes(document);
  if (recipes.length === 0) {
    return {
      code: 'NO_RECIPE',
      kind: 'error',
      message: 'No Schema.org Recipe was found in that JSON.',
    };
  }
  if (recipes.length > 1 && recipeIndex === undefined) {
    return {
      candidates: recipes.map((recipe, index) => ({
        index,
        title: text(recipe.name) || `Recipe ${index + 1}`,
      })),
      kind: 'selection',
    };
  }

  const selectedIndex = recipeIndex ?? 0;
  const selected = recipes[selectedIndex];
  if (selected === undefined) {
    return {
      code: 'INVALID_SELECTION',
      kind: 'error',
      message: 'Choose one of the recipes found in that JSON.',
    };
  }

  return mapRecipe(selected, sourceUrl);
}

function findRecipes(document: unknown): JsonObject[] {
  const found: JsonObject[] = [];
  const stack = [document];
  let visited = 0;

  while (stack.length > 0 && visited < 10_000) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      stack.push(...[...value].reverse());
      continue;
    }
    if (!isObject(value)) continue;
    visited += 1;
    if (hasType(value, 'Recipe')) found.push(value);
    stack.push(...Object.values(value).reverse());
  }

  return found;
}

function mapRecipe(
  recipe: JsonObject,
  sourceUrl?: string,
): Extract<SchemaOrgRecipeResult, { kind: 'preview' }> {
  const warnings: RecipeImportWarning[] = [];
  const title = text(recipe.name);
  if (title === '') {
    warn(warnings, 'MISSING_TITLE', 'Add a title before saving this recipe.');
  }

  const servingCount = positiveNumber(recipe.recipeYield);
  if (servingCount === null) {
    warn(
      warnings,
      'MISSING_YIELD',
      'Confirm how many servings the complete recipe makes.',
    );
  }

  const ingredientLines = strings(recipe.recipeIngredient);
  const ingredients = ingredientLines.map(parseIngredient);
  if (ingredients.length === 0) {
    warn(
      warnings,
      'MISSING_INGREDIENTS',
      'Add at least one ingredient before saving this recipe.',
    );
  } else if (
    ingredients.some(
      ({ name, quantity, unit }) =>
        name === '' || quantity === null || unit === '' || unit === 'item',
    )
  ) {
    warn(
      warnings,
      'INGREDIENT_REVIEW_NEEDED',
      'Some ingredient quantities could not be structured. Check the highlighted fields before saving.',
    );
  }

  const mealTypes = readMealTypes(recipe.recipeCategory);
  if (mealTypes.length === 0) {
    warn(
      warnings,
      'MISSING_MEAL_TYPE',
      'Choose whether this recipe is suitable for breakfast, lunch, or dinner.',
    );
  }

  const importedNutrition = readNutrition(recipe.nutrition, warnings);
  const estimated =
    importedNutrition === null && servingCount !== null
      ? estimateNutrition(ingredients, servingCount, warnings)
      : null;
  const nutrition = importedNutrition ?? estimated?.nutrition ?? null;
  const nutritionProvenance: RecipeNutritionProvenance | null =
    importedNutrition === null
      ? (estimated?.provenance ?? null)
      : { confidence: 'confirmed', source: 'schema_org' };
  const rawImage = recipe.image;
  const photoUrl = readImageUrl(rawImage, sourceUrl);
  if (rawImage !== undefined && photoUrl === null) {
    warn(
      warnings,
      'INVALID_PHOTO',
      'The recipe photo URL is invalid and will not be imported.',
    );
  } else if (photoUrl !== null) {
    warn(
      warnings,
      'PHOTO_NOT_COPIED',
      'A primary photo was found. Add it after saving when importing pasted JSON.',
    );
  }

  return {
    draft: {
      description: text(recipe.description),
      ingredients,
      instructions: readInstructions(recipe.recipeInstructions),
      mealTypes,
      nutrition,
      nutritionProvenance,
      photoStaged: false,
      photoUrl,
      servingCount,
      source: readSource(recipe, sourceUrl),
      tags: {
        cuisines: unique(strings(recipe.recipeCuisine, true)),
        flavours: [],
        proteins: [],
      },
      title,
    },
    kind: 'preview',
    warnings,
  };
}

function estimateNutrition(
  ingredients: RecipeImportDraft['ingredients'],
  servingCount: number,
  warnings: RecipeImportWarning[],
): {
  readonly nutrition: RecipeNutrition;
  readonly provenance: Extract<RecipeNutritionProvenance, { source: 'cofid' }>;
} | null {
  const incomplete = ingredients.filter(
    ({ name, quantity, unit }) =>
      name === '' || quantity === null || unit === '',
  );
  if (incomplete.length > 0) {
    warn(
      warnings,
      'NUTRITION_ESTIMATION_INCOMPLETE',
      `Nutrition could not be estimated until these ingredients have a quantity and unit: ${incomplete
        .map(({ name }) => name || 'unnamed ingredient')
        .join(', ')}.`,
    );
    return null;
  }
  if (ingredients.length === 0) return null;

  const estimation = estimateRecipeNutrition(
    ingredients as RecipeIngredient[],
    servingCount,
  );
  if (estimation.kind === 'incomplete') {
    warn(
      warnings,
      'NUTRITION_ESTIMATION_INCOMPLETE',
      `Nutrition could not be estimated safely. ${estimation.issues
        .map(describeNutritionEstimationIssue)
        .join(' ')}`,
    );
    return null;
  }

  warn(
    warnings,
    'NUTRITION_ESTIMATED',
    'Nutrition was estimated from CoFID 2021. Check the ingredient matches and per-serving values.',
  );
  const reviewMatches = estimation.provenance.matches.filter(
    ({ matchConfidence, quantitySource }) =>
      matchConfidence !== 'high' ||
      quantitySource === 'household_measure' ||
      quantitySource === 'estimated_count',
  );
  const omissions = estimation.provenance.omissions ?? [];
  if (reviewMatches.length > 0 || omissions.length > 0) {
    warn(
      warnings,
      'NUTRITION_MATCH_REVIEW_NEEDED',
      `${[
        ...reviewMatches.map(
          ({ cofidName, grams, ingredientIndex }) =>
            `${ingredients[ingredientIndex]?.name ?? 'ingredient'} → ${cofidName} (${Math.round(grams * 10) / 10} g)`,
        ),
        ...omissions.map(
          ({ ingredientName }) =>
            `${ingredientName} was omitted as a negligible seasoning`,
        ),
      ].join('; ')}.`,
    );
  }
  return estimation;
}

function parseIngredient(
  line: string,
): RecipeImportDraft['ingredients'][number] {
  const [ingredientText, ...noteParts] = line.split(',');
  const main = ingredientText?.trim() ?? '';
  const preparationNote = noteParts.join(',').trim();
  const quantity = leadingQuantity(main);
  if (quantity === null) {
    return { name: main, preparationNote, quantity: null, unit: '' };
  }

  const remainder = main.slice(quantity.characters).trim();
  const unitMatch = /^([a-zA-Z]+)\b/u.exec(remainder);
  const unit = unitNames.get(unitMatch?.[1]?.toLowerCase() ?? '');
  return {
    name:
      unit === undefined
        ? remainder
        : remainder.slice(unitMatch![0].length).trim(),
    preparationNote,
    quantity: quantity.value,
    unit: unit ?? 'item',
  };
}

function leadingQuantity(
  value: string,
): { readonly characters: number; readonly value: number } | null {
  if (/^\d+(?:\.\d+)?\s*[-–]\s*\d/u.test(value)) return null;

  const mixed = /^(\d+)\s+(\d+)\/(\d+)/u.exec(value);
  if (mixed !== null) {
    const denominator = Number(mixed[3]);
    if (denominator === 0) return null;
    return {
      characters: mixed[0].length,
      value: Number(mixed[1]) + Number(mixed[2]) / denominator,
    };
  }

  const fraction = /^(\d+)\/(\d+)/u.exec(value);
  if (fraction !== null) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return {
      characters: fraction[0].length,
      value: Number(fraction[1]) / denominator,
    };
  }

  const unicode = /^(\d+)?([¼½¾⅓⅔⅛⅜⅝⅞])/u.exec(value);
  if (unicode !== null) {
    return {
      characters: unicode[0].length,
      value:
        Number(unicode[1] ?? 0) + (unicodeFractions[unicode[2] ?? ''] ?? 0),
    };
  }

  const decimal = /^\d+(?:\.\d+)?/u.exec(value);
  if (decimal === null) return null;
  const parsed = Number(decimal[0]);
  return parsed > 0 ? { characters: decimal[0].length, value: parsed } : null;
}

function readInstructions(value: unknown): string[] {
  if (typeof value === 'string') return lines(value);
  if (Array.isArray(value)) return value.flatMap(readInstructions);
  if (!isObject(value)) return [];

  if (value.itemListElement !== undefined) {
    return readInstructions(value.itemListElement);
  }
  const instruction = text(value.text) || text(value.name);
  return instruction === '' ? [] : [instruction];
}

function readMealTypes(value: unknown): MealType[] {
  const categories = strings(value, true).map((category) =>
    category.toLowerCase(),
  );
  return (['breakfast', 'lunch', 'dinner'] as const).filter((mealType) =>
    categories.some((category) => category.includes(mealType)),
  );
}

function readNutrition(
  value: unknown,
  warnings: RecipeImportWarning[],
): RecipeNutrition | null {
  if (!isObject(value)) return null;
  const fields = {
    carbsGrams: nonnegativeNumber(value.carbohydrateContent),
    fatGrams: nonnegativeNumber(value.fatContent),
    kcal: positiveNumber(value.calories),
    proteinGrams: nonnegativeNumber(value.proteinContent),
  };
  const supplied = [
    value.calories,
    value.carbohydrateContent,
    value.fatContent,
    value.proteinContent,
  ].some((field) => field !== undefined);
  if (!supplied) return null;
  if (Object.values(fields).some((field) => field === null)) {
    warn(
      warnings,
      'INVALID_NUTRITION',
      'Imported nutrition was incomplete or invalid. Check it before saving.',
    );
    return null;
  }
  return fields as RecipeNutrition;
}

function readSource(
  recipe: JsonObject,
  sourceUrl?: string,
): RecipeSource | null {
  const url =
    httpUrl(recipe.url, sourceUrl) ??
    httpUrl(readId(recipe.mainEntityOfPage), sourceUrl) ??
    httpUrl(sourceUrl);
  const name = entityName(recipe.author) || entityName(recipe.publisher);
  return name === '' && url === null ? null : { name, url };
}

function readImageUrl(value: unknown, sourceUrl?: string): string | null {
  if (Array.isArray(value)) {
    for (const image of value) {
      const url = readImageUrl(image, sourceUrl);
      if (url !== null) return url;
    }
    return null;
  }
  if (typeof value === 'string') return httpUrl(value, sourceUrl);
  if (!isObject(value)) return null;
  return (
    httpUrl(value.url, sourceUrl) ??
    httpUrl(value.contentUrl, sourceUrl) ??
    httpUrl(value['@id'], sourceUrl)
  );
}

function entityName(value: unknown): string {
  if (Array.isArray(value)) return entityName(value[0]);
  if (typeof value === 'string') return text(value);
  return isObject(value) ? text(value.name) : '';
}

function readId(value: unknown): unknown {
  return isObject(value) ? value['@id'] : value;
}

function positiveNumber(value: unknown): number | null {
  const parsed = numberFrom(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function nonnegativeNumber(value: unknown): number | null {
  const parsed = numberFrom(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function numberFrom(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const match = /\d+(?:[.,]\d+)?/u.exec(value.replaceAll(',', ''));
  return match === null ? null : Number(match[0]);
}

function strings(value: unknown, splitCommas = false): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => strings(item, splitCommas));
  }
  if (typeof value !== 'string') return [];
  return (splitCommas ? value.split(',') : [value])
    .map(text)
    .filter((item) => item !== '');
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map(text)
    .filter((line) => line !== '');
}

function text(value: unknown): string {
  return typeof value === 'string'
    ? value
        .replace(/<[^>]*>/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim()
    : '';
}

function httpUrl(value: unknown, baseUrl?: string): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function hasType(value: JsonObject, expected: string): boolean {
  const types = Array.isArray(value['@type'])
    ? value['@type']
    : [value['@type']];
  return types.includes(expected);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unique(values: ReadonlyArray<string>): string[] {
  return [...new Set(values)];
}

function warn(
  warnings: RecipeImportWarning[],
  code: RecipeImportWarning['code'],
  message: string,
): void {
  if (!warnings.some((warning) => warning.code === code)) {
    warnings.push({ code, message });
  }
}
