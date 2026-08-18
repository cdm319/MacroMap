import type {
  RecipeIngredient,
  RecipeNutrition,
  RecipeNutritionProvenance,
} from '@macromap/contracts';
import { cofid2021Rows } from '@macromap/domain/cofid-2021-data';

interface CofidFood {
  readonly carbsHundredths: number;
  readonly code: string;
  readonly fatHundredths: number;
  readonly kcalHundredths: number;
  readonly name: string;
  readonly proteinHundredths: number;
}

export interface NutritionEstimationIssue {
  readonly ingredientIndex: number | null;
  readonly ingredientName: string;
  readonly reason:
    'invalid_quantity' | 'no_energy' | 'no_match' | 'unsupported_unit';
}

export type NutritionEstimationResult =
  | {
      readonly issues: ReadonlyArray<NutritionEstimationIssue>;
      readonly kind: 'incomplete';
    }
  | {
      readonly kind: 'estimated';
      readonly nutrition: RecipeNutrition;
      readonly provenance: Extract<
        RecipeNutritionProvenance,
        { source: 'cofid' }
      >;
    };

const foods = cofid2021Rows.trim().split('\n').map(readFood);
const foodsByCode = new Map(foods.map((food) => [food.code, food]));
const foodsByName = new Map<string, CofidFood[]>();

for (const food of foods) {
  const name = normaliseName(food.name);
  foodsByName.set(name, [...(foodsByName.get(name) ?? []), food]);
}

const aliasEntries = [
  ['basmati rice', '11-857'],
  ['beef mince', '18-469'],
  ['carrot', '13-496'],
  ['cheddar', '12-346'],
  ['cheddar cheese', '12-346'],
  ['dried pasta', '11-716'],
  ['egg', '12-937'],
  ['garlic', '13-244'],
  ['granulated sugar', '17-063'],
  ['minced beef', '18-469'],
  ['olive oil', '17-038'],
  ['onion', '13-499'],
  ['pasta', '11-716'],
  ['plain flour', '11-886'],
  ['potato', '13-489'],
  ['salmon', '16-356'],
  ['salmon fillet', '16-356'],
  ['salted butter', '17-685'],
  ['semi skimmed milk', '12-313'],
  ['tomato', '13-517'],
  ['unsalted butter', '17-661'],
  ['white flour', '11-886'],
  ['white rice', '11-861'],
  ['white sugar', '17-063'],
  ['whole milk', '12-596'],
] as const;
const aliases = new Map(
  aliasEntries.map(([name, code]) => [normaliseName(name), code] as const),
);

const massUnits = new Map<
  string,
  { readonly grams: number; readonly source: 'avoirdupois' | 'metric' }
>([
  ['g', { grams: 1, source: 'metric' }],
  ['gram', { grams: 1, source: 'metric' }],
  ['grams', { grams: 1, source: 'metric' }],
  ['kg', { grams: 1_000, source: 'metric' }],
  ['kilogram', { grams: 1_000, source: 'metric' }],
  ['kilograms', { grams: 1_000, source: 'metric' }],
  ['lb', { grams: 453.59237, source: 'avoirdupois' }],
  ['lbs', { grams: 453.59237, source: 'avoirdupois' }],
  ['ounce', { grams: 28.349523125, source: 'avoirdupois' }],
  ['ounces', { grams: 28.349523125, source: 'avoirdupois' }],
  ['oz', { grams: 28.349523125, source: 'avoirdupois' }],
  ['pound', { grams: 453.59237, source: 'avoirdupois' }],
  ['pounds', { grams: 453.59237, source: 'avoirdupois' }],
]);

export function estimateRecipeNutrition(
  ingredients: ReadonlyArray<RecipeIngredient>,
  servingCount: number,
): NutritionEstimationResult {
  const issues: NutritionEstimationIssue[] = [];
  const matches: Extract<
    RecipeNutritionProvenance,
    { source: 'cofid' }
  >['matches'][number][] = [];
  const totals = {
    carbs: 0n,
    fat: 0n,
    kcal: 0n,
    protein: 0n,
  };

  ingredients.forEach((ingredient, ingredientIndex) => {
    const quantity = normaliseMass(ingredient.quantity, ingredient.unit);
    if (quantity === null) {
      issues.push({
        ingredientIndex,
        ingredientName: ingredient.name,
        reason: massUnits.has(ingredient.unit.trim().toLowerCase())
          ? 'invalid_quantity'
          : 'unsupported_unit',
      });
      return;
    }

    const match = matchFood(ingredient.name);
    if (match === null) {
      issues.push({
        ingredientIndex,
        ingredientName: ingredient.name,
        reason: 'no_match',
      });
      return;
    }

    totals.kcal += quantity.milligrams * BigInt(match.food.kcalHundredths);
    totals.protein +=
      quantity.milligrams * BigInt(match.food.proteinHundredths);
    totals.carbs += quantity.milligrams * BigInt(match.food.carbsHundredths);
    totals.fat += quantity.milligrams * BigInt(match.food.fatHundredths);
    matches.push({
      canonicalName: normaliseName(ingredient.name),
      cofidCode: match.food.code,
      cofidName: match.food.name,
      grams: Number(quantity.milligrams) / 1_000,
      ingredientIndex,
      matchConfidence: match.confidence,
      quantitySource: quantity.source,
    });
  });

  if (issues.length > 0 || matches.length !== ingredients.length) {
    return { issues, kind: 'incomplete' };
  }

  const servingThousandths = Math.round(servingCount * 1_000);
  if (!Number.isSafeInteger(servingThousandths) || servingThousandths <= 0) {
    return {
      issues: [
        {
          ingredientIndex: null,
          ingredientName: 'Recipe yield',
          reason: 'invalid_quantity',
        },
      ],
      kind: 'incomplete',
    };
  }

  const denominator = 100_000n * BigInt(servingThousandths);
  const perServing = (value: bigint) =>
    Number(roundDivide(value * 1_000n, denominator)) / 100;
  const nutrition = {
    carbsGrams: perServing(totals.carbs),
    fatGrams: perServing(totals.fat),
    kcal: perServing(totals.kcal),
    proteinGrams: perServing(totals.protein),
  };
  if (nutrition.kcal <= 0) {
    return {
      issues: [
        {
          ingredientIndex: null,
          ingredientName: 'Recipe',
          reason: 'no_energy',
        },
      ],
      kind: 'incomplete',
    };
  }

  return {
    kind: 'estimated',
    nutrition,
    provenance: {
      confidence: matches.some(
        ({ matchConfidence }) => matchConfidence !== 'high',
      )
        ? 'medium'
        : 'high',
      datasetVersion: '2021',
      matches,
      source: 'cofid',
    },
  };
}

function readFood(row: string): CofidFood {
  const cells = row.split('\t');
  if (cells.length !== 6) throw new Error('Invalid bundled CoFID row.');
  return {
    carbsHundredths: Number(cells[4]),
    code: cells[0]!,
    fatHundredths: Number(cells[5]),
    kcalHundredths: Number(cells[2]),
    name: cells[1]!,
    proteinHundredths: Number(cells[3]),
  };
}

function matchFood(
  ingredientName: string,
): { readonly confidence: 'high' | 'medium'; readonly food: CofidFood } | null {
  const name = normaliseName(ingredientName);
  const exact = foodsByName.get(name);
  if (exact?.length === 1) return { confidence: 'high', food: exact[0]! };

  const alias = aliases.get(name);
  const food = alias === undefined ? undefined : foodsByCode.get(alias);
  return food === undefined ? null : { confidence: 'medium', food };
}

function normaliseMass(
  quantity: number,
  unit: string,
): {
  readonly milligrams: bigint;
  readonly source: 'avoirdupois' | 'metric';
} | null {
  const conversion = massUnits.get(unit.trim().toLowerCase());
  if (conversion === undefined) return null;
  const milligrams = Math.round(quantity * conversion.grams * 1_000);
  return Number.isSafeInteger(milligrams) && milligrams > 0
    ? { milligrams: BigInt(milligrams), source: conversion.source }
    : null;
}

function normaliseName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/gu, ' and ')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map(singular)
    .join(' ');
}

function singular(value: string): string {
  if (value.endsWith('ies') && value.length > 4)
    return `${value.slice(0, -3)}y`;
  if (value.endsWith('oes') && value.length > 4) return value.slice(0, -2);
  if (value.endsWith('s') && !value.endsWith('ss') && value.length > 3) {
    return value.slice(0, -1);
  }
  return value;
}

function roundDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}
