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

interface IngredientRule {
  readonly aliases: ReadonlyArray<string>;
  readonly cofidCode: string;
  readonly countGrams?: number;
  readonly gramsPerMillilitre?: number;
  readonly measures?: Readonly<Record<string, number>>;
}

interface FoodMatch {
  readonly confidence: 'high' | 'medium';
  readonly food: CofidFood;
  readonly rule?: IngredientRule;
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

const ingredientRules: ReadonlyArray<IngredientRule> = [
  { aliases: ['apple'], cofidCode: '14-319', countGrams: 150 },
  { aliases: ['avocado'], cofidCode: '14-386', countGrams: 150 },
  { aliases: ['baked beans'], cofidCode: '13-532' },
  { aliases: ['baking potato'], cofidCode: '13-489', countGrams: 250 },
  { aliases: ['banana'], cofidCode: '14-318', countGrams: 120 },
  { aliases: ['basmati rice'], cofidCode: '11-857' },
  { aliases: ['beef mince', 'minced beef'], cofidCode: '18-469' },
  {
    aliases: ['blueberry', 'blueberries'],
    cofidCode: '14-325',
    gramsPerMillilitre: 0.62,
  },
  {
    aliases: ['broccoli', 'tenderstem broccoli'],
    cofidCode: '13-502',
  },
  {
    aliases: ['butter', 'salted butter'],
    cofidCode: '17-685',
    gramsPerMillilitre: 0.96,
  },
  {
    aliases: ['unsalted butter'],
    cofidCode: '17-661',
    gramsPerMillilitre: 0.96,
  },
  { aliases: ['carrot'], cofidCode: '13-496', countGrams: 80 },
  {
    aliases: ['cashew', 'cashew nut'],
    cofidCode: '14-811',
    gramsPerMillilitre: 0.57,
  },
  {
    aliases: ['cheddar', 'cheddar cheese'],
    cofidCode: '12-346',
    gramsPerMillilitre: 0.46,
  },
  { aliases: ['halloumi', 'halloumi cheese'], cofidCode: '12-496' },
  {
    aliases: ['chicken breast', 'chicken breast fillet'],
    cofidCode: '18-290',
    countGrams: 150,
  },
  {
    aliases: ['chicken stock'],
    cofidCode: '17-681',
    gramsPerMillilitre: 1,
  },
  { aliases: ['chorizo'], cofidCode: '19-516' },
  {
    aliases: ['coconut milk'],
    cofidCode: '14-889',
    gramsPerMillilitre: 0.97,
  },
  {
    aliases: ['coconut oil'],
    cofidCode: '17-031',
    gramsPerMillilitre: 0.92,
  },
  {
    aliases: ['cooked basmati rice', 'pre cooked rice'],
    cofidCode: '11-858',
    gramsPerMillilitre: 0.67,
  },
  {
    aliases: ['coriander', 'coriander leaf'],
    cofidCode: '13-888',
    gramsPerMillilitre: 0.07,
  },
  {
    aliases: ['corn flour', 'cornflour'],
    cofidCode: '11-1045',
    gramsPerMillilitre: 0.55,
  },
  {
    aliases: ['curry powder'],
    cofidCode: '13-876',
    gramsPerMillilitre: 0.4,
  },
  { aliases: ['egg'], cofidCode: '12-937', countGrams: 50 },
  { aliases: ['large egg'], cofidCode: '12-937', countGrams: 60 },
  {
    aliases: ['garam masala'],
    cofidCode: '13-829',
    gramsPerMillilitre: 0.4,
  },
  {
    aliases: ['garlic', 'garlic clove', 'minced garlic'],
    cofidCode: '13-244',
    countGrams: 3,
    gramsPerMillilitre: 0.56,
    measures: { clove: 3 },
  },
  {
    aliases: ['garlic powder'],
    cofidCode: '13-830',
    gramsPerMillilitre: 0.62,
  },
  {
    aliases: ['ginger'],
    cofidCode: '13-890',
    gramsPerMillilitre: 0.4,
    measures: { cm: 5 },
  },
  {
    aliases: ['ground ginger'],
    cofidCode: '13-832',
    gramsPerMillilitre: 0.36,
  },
  { aliases: ['green bean'], cofidCode: '13-514' },
  {
    aliases: ['greek yogurt', 'greek yoghurt'],
    cofidCode: '12-555',
    gramsPerMillilitre: 1.03,
  },
  {
    aliases: ['ground almond'],
    cofidCode: '14-870',
    gramsPerMillilitre: 0.4,
  },
  {
    aliases: ['honey'],
    cofidCode: '17-050',
    gramsPerMillilitre: 1.4,
  },
  { aliases: ['lemon'], cofidCode: '14-130', countGrams: 58 },
  { aliases: ['lime'], cofidCode: '14-131', countGrams: 44 },
  {
    aliases: ['olive oil'],
    cofidCode: '17-038',
    gramsPerMillilitre: 0.91,
  },
  {
    aliases: ['onion', 'red onion'],
    cofidCode: '13-499',
    countGrams: 150,
  },
  { aliases: ['pasta', 'dried pasta'], cofidCode: '11-716' },
  {
    aliases: ['passata', 'canned tomato'],
    cofidCode: '13-530',
    gramsPerMillilitre: 1,
  },
  {
    aliases: ['plain flour', 'white flour'],
    cofidCode: '11-886',
    gramsPerMillilitre: 0.53,
  },
  { aliases: ['potato'], cofidCode: '13-489', countGrams: 175 },
  {
    aliases: ['rapeseed oil'],
    cofidCode: '17-041',
    gramsPerMillilitre: 0.91,
  },
  {
    aliases: ['red chilli'],
    cofidCode: '13-317',
    countGrams: 15,
  },
  { aliases: ['red pepper'], cofidCode: '13-524', countGrams: 160 },
  {
    aliases: ['rolled oat', 'oat'],
    cofidCode: '11-788',
    gramsPerMillilitre: 0.34,
  },
  {
    aliases: ['salmon', 'salmon fillet'],
    cofidCode: '16-356',
    countGrams: 120,
  },
  {
    aliases: ['semi skimmed milk'],
    cofidCode: '12-313',
    gramsPerMillilitre: 1.03,
  },
  {
    aliases: ['sesame oil'],
    cofidCode: '17-043',
    gramsPerMillilitre: 0.92,
  },
  {
    aliases: ['sesame seed'],
    cofidCode: '14-844',
    gramsPerMillilitre: 0.6,
  },
  { aliases: ['sirloin steak'], cofidCode: '18-064', countGrams: 200 },
  {
    aliases: ['soy sauce', 'light soy sauce', 'dark soy sauce'],
    cofidCode: '17-721',
    gramsPerMillilitre: 1.16,
  },
  {
    aliases: ['spinach', 'baby spinach'],
    cofidCode: '13-521',
    measures: { handful: 30 },
  },
  { aliases: ['spring onion'], cofidCode: '13-352', countGrams: 15 },
  {
    aliases: ['strawberry', 'strawberries'],
    cofidCode: '14-324',
    gramsPerMillilitre: 0.63,
  },
  {
    aliases: ['sugar', 'granulated sugar', 'white sugar'],
    cofidCode: '17-063',
    gramsPerMillilitre: 0.85,
  },
  { aliases: ['sweet potato'], cofidCode: '13-463', countGrams: 200 },
  {
    aliases: ['sunflower oil'],
    cofidCode: '17-045',
    gramsPerMillilitre: 0.91,
  },
  { aliases: ['tomato'], cofidCode: '13-517', countGrams: 100 },
  {
    aliases: ['tomato puree'],
    cofidCode: '13-531',
    gramsPerMillilitre: 1.05,
  },
  {
    aliases: ['vegetable oil', 'sunflower or vegetable oil for frying'],
    cofidCode: '17-686',
    gramsPerMillilitre: 0.91,
  },
  {
    aliases: ['vinegar', 'balsamic vinegar', 'red wine vinegar'],
    cofidCode: '17-339',
    gramsPerMillilitre: 1,
  },
  {
    aliases: ['water'],
    cofidCode: '17-377',
    gramsPerMillilitre: 1,
  },
  { aliases: ['white rice'], cofidCode: '11-861' },
  {
    aliases: ['whole milk'],
    cofidCode: '12-596',
    gramsPerMillilitre: 1.03,
  },
];

const ignoredNameWords = new Set([
  'beaten',
  'boneless',
  'chopped',
  'crushed',
  'cut',
  'diced',
  'drained',
  'extra',
  'finely',
  'fresh',
  'grated',
  'into',
  'juiced',
  'organic',
  'peeled',
  'piece',
  'roughly',
  'skinless',
  'sliced',
  'trimmed',
  'unwaxed',
  'virgin',
  'zested',
]);

const aliases = new Map<string, IngredientRule>();
for (const rule of ingredientRules) {
  for (const alias of rule.aliases) {
    aliases.set(normaliseIngredientName(alias), rule);
  }
}

const negligibleSeasonings = new Set(
  [
    'baking powder',
    'black pepper',
    'chilli flakes',
    'chilli powder',
    'cumin',
    'onion granules',
    'onion powder',
    'oregano',
    'paprika',
    'salt',
    'salt and pepper',
    'smoked paprika',
    'turmeric',
    'white pepper',
  ].map(normaliseIngredientName),
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

const volumeUnits = new Map([
  ['cup', 240],
  ['cups', 240],
  ['l', 1_000],
  ['liter', 1_000],
  ['liters', 1_000],
  ['litre', 1_000],
  ['litres', 1_000],
  ['milliliter', 1],
  ['milliliters', 1],
  ['millilitre', 1],
  ['millilitres', 1],
  ['ml', 1],
  ['tablespoon', 15],
  ['tablespoons', 15],
  ['tbsp', 15],
  ['teaspoon', 5],
  ['teaspoons', 5],
  ['tsp', 5],
]);

const countUnits = new Set([
  'item',
  'items',
  'piece',
  'pieces',
  'unit',
  'units',
  'whole',
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
  const omissions: NonNullable<
    Extract<RecipeNutritionProvenance, { source: 'cofid' }>['omissions']
  > = [];
  const totals = {
    carbs: 0n,
    fat: 0n,
    kcal: 0n,
    protein: 0n,
  };

  ingredients.forEach((ingredient, ingredientIndex) => {
    if (isNegligibleSeasoning(ingredient)) {
      omissions.push({
        ingredientIndex,
        ingredientName: ingredient.name,
        reason: 'negligible_seasoning',
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

    const quantity = normaliseQuantity(ingredient, match.rule);
    if (quantity === null) {
      issues.push({
        ingredientIndex,
        ingredientName: ingredient.name,
        reason:
          Number.isFinite(ingredient.quantity) && ingredient.quantity > 0
            ? 'unsupported_unit'
            : 'invalid_quantity',
      });
      return;
    }

    totals.kcal += quantity.milligrams * BigInt(match.food.kcalHundredths);
    totals.protein +=
      quantity.milligrams * BigInt(match.food.proteinHundredths);
    totals.carbs += quantity.milligrams * BigInt(match.food.carbsHundredths);
    totals.fat += quantity.milligrams * BigInt(match.food.fatHundredths);
    matches.push({
      canonicalName: normaliseIngredientName(ingredient.name),
      cofidCode: match.food.code,
      cofidName: match.food.name,
      grams: Number(quantity.milligrams) / 1_000,
      ingredientIndex,
      matchConfidence: match.confidence,
      quantitySource: quantity.source,
    });
  });

  if (
    issues.length > 0 ||
    matches.length + omissions.length !== ingredients.length
  ) {
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
      confidence: nutritionConfidence(matches, omissions),
      datasetVersion: '2021',
      matches,
      ...(omissions.length === 0 ? {} : { omissions }),
      source: 'cofid',
    },
  };
}

export function describeNutritionEstimationIssue({
  ingredientName,
  reason,
}: NutritionEstimationIssue): string {
  if (reason === 'no_match') {
    return `No safe CoFID match was found for ${ingredientName}.`;
  }
  if (reason === 'unsupported_unit') {
    return `${ingredientName} needs a supported unit or an explicit weight.`;
  }
  if (reason === 'no_energy') {
    return `${ingredientName} did not provide usable energy data.`;
  }
  return `${ingredientName} needs a usable quantity.`;
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

function matchFood(ingredientName: string): FoodMatch | null {
  const name = normaliseName(ingredientName);
  const rule = findIngredientRule(normaliseIngredientName(ingredientName));
  const exact = foodsByName.get(name);
  if (exact?.length === 1) {
    return {
      confidence: 'high',
      food: exact[0]!,
      ...(rule === undefined ? {} : { rule }),
    };
  }

  if (rule === undefined) return null;
  const food = foodsByCode.get(rule.cofidCode);
  return food === undefined ? null : { confidence: 'medium', food, rule };
}

function findIngredientRule(name: string): IngredientRule | undefined {
  const direct = aliases.get(name);
  if (direct !== undefined) return direct;

  const phraseMatches = new Set<IngredientRule>();
  for (const [alias, rule] of aliases) {
    if (name.startsWith(`${alias} `) || name.endsWith(` ${alias}`)) {
      phraseMatches.add(rule);
    }
  }
  return phraseMatches.size === 1 ? [...phraseMatches][0] : undefined;
}

function normaliseQuantity(
  ingredient: RecipeIngredient,
  rule: IngredientRule | undefined,
): {
  readonly milligrams: bigint;
  readonly source:
    'avoirdupois' | 'estimated_count' | 'household_measure' | 'metric';
} | null {
  const { quantity } = ingredient;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const unit = ingredient.unit.trim().toLowerCase();
  const mass = massUnits.get(unit);
  if (mass !== undefined) {
    return measuredQuantity(quantity * mass.grams, mass.source);
  }

  const measureGrams = rule?.measures?.[unit];
  if (measureGrams !== undefined) {
    return measuredQuantity(quantity * measureGrams, 'household_measure');
  }

  const millilitres = volumeUnits.get(unit);
  if (millilitres !== undefined && rule?.gramsPerMillilitre !== undefined) {
    return measuredQuantity(
      quantity * millilitres * rule.gramsPerMillilitre,
      'household_measure',
    );
  }

  if (countUnits.has(unit) && rule?.countGrams !== undefined) {
    return measuredQuantity(quantity * rule.countGrams, 'estimated_count');
  }

  return null;
}

function measuredQuantity(
  grams: number,
  source: 'avoirdupois' | 'estimated_count' | 'household_measure' | 'metric',
): { readonly milligrams: bigint; readonly source: typeof source } | null {
  const milligrams = Math.round(grams * 1_000);
  return Number.isSafeInteger(milligrams) && milligrams > 0
    ? { milligrams: BigInt(milligrams), source }
    : null;
}

function isNegligibleSeasoning(ingredient: RecipeIngredient): boolean {
  const name = normaliseIngredientName(ingredient.name);
  if (
    ![...negligibleSeasonings].some(
      (seasoning) => name === seasoning || name.endsWith(` ${seasoning}`),
    )
  ) {
    return false;
  }

  const unit = ingredient.unit.trim().toLowerCase();
  const mass = massUnits.get(unit);
  if (mass !== undefined) return ingredient.quantity * mass.grams <= 5;

  const millilitres = volumeUnits.get(unit);
  if (millilitres !== undefined) {
    return ingredient.quantity * millilitres <= 5;
  }

  return ['pinch', 'pinches', ...countUnits].includes(unit);
}

function nutritionConfidence(
  matches: ReadonlyArray<
    Extract<RecipeNutritionProvenance, { source: 'cofid' }>['matches'][number]
  >,
  omissions: ReadonlyArray<unknown>,
): 'high' | 'low' | 'medium' {
  if (
    omissions.length > 0 ||
    matches.some(({ quantitySource }) => quantitySource === 'estimated_count')
  ) {
    return 'low';
  }
  return matches.some(
    ({ matchConfidence, quantitySource }) =>
      matchConfidence !== 'high' || quantitySource === 'household_measure',
  )
    ? 'medium'
    : 'high';
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

function normaliseIngredientName(value: string): string {
  return normaliseName(value)
    .split(' ')
    .filter((word) => !ignoredNameWords.has(word))
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
