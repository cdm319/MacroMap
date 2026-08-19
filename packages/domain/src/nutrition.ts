import type {
  RecipeIngredient,
  RecipeNutrition,
  RecipeNutritionProvenance,
} from '@macromap/contracts';
import { cofid2021Rows } from '@macromap/domain/cofid-2021-data';

interface NutritionFood {
  readonly carbsHundredths: number;
  readonly code: string;
  readonly fatHundredths: number;
  readonly foodSource: 'cofid' | 'label';
  readonly foodVersion: string;
  readonly kcalHundredths: number;
  readonly name: string;
  readonly proteinHundredths: number;
}

type NutritionDatabaseProvenance = Extract<
  RecipeNutritionProvenance,
  { source: 'nutrition_database' }
>;
type NutritionDatabaseMatch = NutritionDatabaseProvenance['matches'][number];
type QuantitySource = NutritionDatabaseMatch['quantitySource'];

interface IngredientMeasure {
  readonly grams: number;
  readonly source: 'household_measure' | 'label_measure';
}

interface IngredientRule {
  readonly aliases: ReadonlyArray<string>;
  readonly foodCode: string;
  readonly countGrams?: number;
  readonly gramsPerMillilitre?: number;
  readonly matchConfidence?: 'high';
  readonly measures?: Readonly<Record<string, number | IngredientMeasure>>;
}

interface FoodMatch {
  readonly confidence: 'high' | 'medium';
  readonly food: NutritionFood;
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
      readonly provenance: NutritionDatabaseProvenance;
    };

const foods: NutritionFood[] = [
  ...cofid2021Rows.trim().split('\n').map(readFood),
  // Label source: data/generic-protein-powder.md
  {
    carbsHundredths: 680,
    code: 'generic-protein-powder',
    fatHundredths: 450,
    foodSource: 'label',
    foodVersion: '2026-08-19',
    kcalHundredths: 37_100,
    name: 'Generic protein powder',
    proteinHundredths: 7_400,
  },
];
const foodsByCode = new Map(foods.map((food) => [food.code, food]));
const foodsByName = new Map<string, NutritionFood[]>();

for (const food of foods) {
  const name = normaliseName(food.name);
  foodsByName.set(name, [...(foodsByName.get(name) ?? []), food]);
}

const ingredientRules: ReadonlyArray<IngredientRule> = [
  { aliases: ['apple'], foodCode: '14-319', countGrams: 150 },
  { aliases: ['avocado'], foodCode: '14-386', countGrams: 150 },
  { aliases: ['baked beans', 'heinz baked beans'], foodCode: '13-532' },
  { aliases: ['baking potato'], foodCode: '13-489', countGrams: 250 },
  { aliases: ['banana'], foodCode: '14-318', countGrams: 120 },
  { aliases: ['basmati rice'], foodCode: '11-857' },
  {
    aliases: ['baby potato', 'baby new potato', 'new potato'],
    foodCode: '13-618',
  },
  { aliases: ['beef mince', 'minced beef'], foodCode: '18-469' },
  {
    aliases: ['blueberry', 'blueberries'],
    foodCode: '14-325',
    gramsPerMillilitre: 0.62,
  },
  {
    aliases: ['broccoli', 'tenderstem broccoli'],
    foodCode: '13-502',
  },
  {
    aliases: ['butter', 'salted butter'],
    foodCode: '17-685',
    gramsPerMillilitre: 0.96,
  },
  {
    aliases: ['unsalted butter'],
    foodCode: '17-661',
    gramsPerMillilitre: 0.96,
  },
  { aliases: ['carrot'], foodCode: '13-496', countGrams: 80 },
  {
    aliases: ['cashew', 'cashew nut'],
    foodCode: '14-811',
    gramsPerMillilitre: 0.57,
  },
  {
    aliases: ['cheddar', 'cheddar cheese'],
    foodCode: '12-346',
    gramsPerMillilitre: 0.46,
  },
  { aliases: ['halloumi', 'halloumi cheese'], foodCode: '12-496' },
  {
    aliases: ['chicken breast', 'chicken breast fillet'],
    foodCode: '18-290',
    countGrams: 150,
  },
  {
    aliases: ['chicken stock'],
    foodCode: '17-681',
    gramsPerMillilitre: 1,
  },
  { aliases: ['chorizo'], foodCode: '19-516' },
  {
    aliases: [
      'coconut milk',
      'coconut milk not light',
      'full fat coconut milk',
      'tinned coconut milk',
    ],
    foodCode: '14-889',
    gramsPerMillilitre: 0.97,
  },
  {
    aliases: ['desiccated coconut'],
    foodCode: '14-873',
  },
  {
    aliases: ['coconut oil'],
    foodCode: '17-031',
    gramsPerMillilitre: 0.92,
  },
  {
    aliases: ['cooked basmati rice', 'pre cooked rice'],
    foodCode: '11-858',
    gramsPerMillilitre: 0.67,
  },
  {
    aliases: ['coriander', 'coriander leaf'],
    foodCode: '13-888',
    gramsPerMillilitre: 0.07,
  },
  {
    aliases: ['corn flour', 'cornflour'],
    foodCode: '11-1045',
    gramsPerMillilitre: 0.55,
  },
  {
    aliases: ['curry powder'],
    foodCode: '13-876',
    gramsPerMillilitre: 0.4,
  },
  { aliases: ['egg'], foodCode: '12-937', countGrams: 50 },
  { aliases: ['large egg'], foodCode: '12-937', countGrams: 60 },
  {
    aliases: [
      'protein powder',
      'generic protein powder',
      'vanilla protein powder',
      'chocolate protein powder',
      'strawberry protein powder',
      'strawberry or vanilla protein powder',
      'chocolate or vanilla protein powder',
      'protein powder chocolate',
      'whey protein powder',
    ],
    foodCode: 'generic-protein-powder',
    matchConfidence: 'high',
    measures: {
      scoop: { grams: 30, source: 'label_measure' },
      scoops: { grams: 30, source: 'label_measure' },
    },
  },
  // A hydrated noodle is the closest CoFID profile to chilled fresh noodles.
  {
    aliases: ['fresh egg noodle'],
    foodCode: '11-941',
  },
  {
    aliases: ['dried egg noodle'],
    foodCode: '11-719',
  },
  {
    aliases: ['frozen pea'],
    foodCode: '13-527',
  },
  {
    aliases: ['garam masala'],
    foodCode: '13-829',
    gramsPerMillilitre: 0.4,
  },
  {
    aliases: ['garlic', 'garlic clove', 'minced garlic'],
    foodCode: '13-244',
    countGrams: 3,
    gramsPerMillilitre: 0.56,
    measures: { clove: 3 },
  },
  {
    aliases: ['garlic powder'],
    foodCode: '13-830',
    gramsPerMillilitre: 0.62,
  },
  {
    aliases: ['ginger'],
    foodCode: '13-890',
    gramsPerMillilitre: 0.4,
    measures: { cm: 5 },
  },
  {
    aliases: ['ground ginger'],
    foodCode: '13-832',
    gramsPerMillilitre: 0.36,
  },
  { aliases: ['green bean'], foodCode: '13-514' },
  {
    aliases: ['greek yogurt', 'greek yoghurt'],
    foodCode: '12-555',
    gramsPerMillilitre: 1.03,
  },
  {
    aliases: ['ground almond'],
    foodCode: '14-870',
    gramsPerMillilitre: 0.4,
  },
  {
    aliases: ['honey'],
    foodCode: '17-050',
    gramsPerMillilitre: 1.4,
  },
  { aliases: ['lemon'], foodCode: '14-130', countGrams: 58 },
  { aliases: ['lime'], foodCode: '14-131', countGrams: 44 },
  { aliases: ['mangetout'], foodCode: '13-122' },
  {
    aliases: ['olive oil'],
    foodCode: '17-038',
    gramsPerMillilitre: 0.91,
  },
  {
    aliases: ['onion', 'red onion'],
    foodCode: '13-499',
    countGrams: 150,
  },
  {
    aliases: ['pasta', 'dried pasta', 'dried orzo', 'orzo'],
    foodCode: '11-716',
  },
  {
    aliases: ['passata', 'canned tomato'],
    foodCode: '13-530',
    gramsPerMillilitre: 1,
  },
  {
    aliases: ['plain flour', 'white flour'],
    foodCode: '11-886',
    gramsPerMillilitre: 0.53,
  },
  { aliases: ['potato'], foodCode: '13-489', countGrams: 175 },
  { aliases: ['pork fillet'], foodCode: '18-510' },
  {
    aliases: ['rapeseed oil'],
    foodCode: '17-041',
    gramsPerMillilitre: 0.91,
  },
  {
    aliases: ['red chilli'],
    foodCode: '13-317',
    countGrams: 15,
  },
  { aliases: ['raspberry'], foodCode: '14-375' },
  { aliases: ['red lentil', 'dried red lentil'], foodCode: '13-657' },
  { aliases: ['red pepper'], foodCode: '13-524', countGrams: 160 },
  {
    aliases: ['rolled oat', 'oat', 'porridge oat'],
    foodCode: '11-788',
    gramsPerMillilitre: 0.34,
  },
  {
    aliases: ['salmon', 'salmon fillet'],
    foodCode: '16-356',
    countGrams: 120,
  },
  {
    aliases: ['semi skimmed milk'],
    foodCode: '12-313',
    gramsPerMillilitre: 1.03,
  },
  {
    aliases: ['sesame oil'],
    foodCode: '17-043',
    gramsPerMillilitre: 0.92,
  },
  {
    aliases: ['sesame seed'],
    foodCode: '14-844',
    gramsPerMillilitre: 0.6,
  },
  { aliases: ['sirloin steak'], foodCode: '18-064', countGrams: 200 },
  {
    aliases: ['soy sauce', 'light soy sauce', 'dark soy sauce'],
    foodCode: '17-721',
    gramsPerMillilitre: 1.16,
  },
  {
    aliases: ['spinach', 'baby spinach', 'baby spinach leaf'],
    foodCode: '13-521',
    measures: { handful: 30 },
  },
  { aliases: ['spring onion'], foodCode: '13-352', countGrams: 15 },
  {
    aliases: ['strawberry', 'strawberries'],
    foodCode: '14-324',
    gramsPerMillilitre: 0.63,
  },
  {
    aliases: ['sugar', 'granulated sugar', 'white sugar'],
    foodCode: '17-063',
    gramsPerMillilitre: 0.85,
  },
  { aliases: ['sweet potato'], foodCode: '13-463', countGrams: 200 },
  { aliases: ['sweetcorn'], foodCode: '13-622' },
  {
    aliases: ['sunflower oil'],
    foodCode: '17-045',
    gramsPerMillilitre: 0.91,
  },
  { aliases: ['tomato'], foodCode: '13-517', countGrams: 100 },
  {
    aliases: ['tomato puree'],
    foodCode: '13-531',
    gramsPerMillilitre: 1.05,
  },
  { aliases: ['tuna steak'], foodCode: '16-399' },
  {
    aliases: ['vegetable oil', 'sunflower or vegetable oil for frying'],
    foodCode: '17-686',
    gramsPerMillilitre: 0.91,
  },
  {
    aliases: ['vinegar', 'balsamic vinegar', 'red wine vinegar'],
    foodCode: '17-339',
    gramsPerMillilitre: 1,
  },
  {
    aliases: ['water'],
    foodCode: '17-377',
    gramsPerMillilitre: 1,
  },
  { aliases: ['walnut'], foodCode: '14-879' },
  { aliases: ['white rice'], foodCode: '11-861' },
  {
    aliases: ['whole milk'],
    foodCode: '12-596',
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
  'extra',
  'finely',
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
    aliases.set(normaliseName(alias), rule);
  }
}

const negligibleSeasonings = new Set(
  [
    'baking powder',
    'black pepper',
    'chilli flakes',
    'chilli powder',
    'cinnamon',
    'cumin',
    'ground cinnamon',
    'onion granules',
    'onion powder',
    'oregano',
    'paprika',
    'pepper',
    'salt',
    'salt and black pepper',
    'salt and pepper',
    'sea salt',
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
  const matches: NutritionDatabaseMatch[] = [];
  const omissions: NonNullable<NutritionDatabaseProvenance['omissions']> = [];
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
      foodCode: match.food.code,
      foodName: match.food.name,
      foodSource: match.food.foodSource,
      foodVersion: match.food.foodVersion,
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
      matches,
      ...(omissions.length === 0 ? {} : { omissions }),
      source: 'nutrition_database',
    },
  };
}

export function describeNutritionEstimationIssue({
  ingredientName,
  reason,
}: NutritionEstimationIssue): string {
  if (reason === 'no_match') {
    return `No safe nutrition database match was found for ${ingredientName}.`;
  }
  if (reason === 'unsupported_unit') {
    return `${ingredientName} needs a supported unit or an explicit weight.`;
  }
  if (reason === 'no_energy') {
    return `${ingredientName} did not provide usable energy data.`;
  }
  return `${ingredientName} needs a usable quantity.`;
}

function readFood(row: string): NutritionFood {
  const cells = row.split('\t');
  if (cells.length !== 6) throw new Error('Invalid bundled CoFID row.');
  return {
    carbsHundredths: Number(cells[4]),
    code: cells[0]!,
    fatHundredths: Number(cells[5]),
    foodSource: 'cofid',
    foodVersion: '2021',
    kcalHundredths: Number(cells[2]),
    name: cells[1]!,
    proteinHundredths: Number(cells[3]),
  };
}

function matchFood(ingredientName: string): FoodMatch | null {
  const name = normaliseName(ingredientName);
  const rule = findIngredientRule(ingredientName);
  const exact = foodsByName.get(name);
  if (exact?.length === 1) {
    return {
      confidence: 'high',
      food: exact[0]!,
      ...(rule === undefined ? {} : { rule }),
    };
  }

  if (rule === undefined) return null;
  const food = foodsByCode.get(rule.foodCode);
  return food === undefined
    ? null
    : { confidence: rule.matchConfidence ?? 'medium', food, rule };
}

function findIngredientRule(
  ingredientName: string,
): IngredientRule | undefined {
  const direct = aliases.get(normaliseName(ingredientName));
  if (direct !== undefined) return direct;
  return aliases.get(normaliseIngredientName(ingredientName));
}

function normaliseQuantity(
  ingredient: RecipeIngredient,
  rule: IngredientRule | undefined,
): {
  readonly milligrams: bigint;
  readonly source: QuantitySource;
} | null {
  const { quantity } = ingredient;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const unit = ingredient.unit.trim().toLowerCase();
  const mass = massUnits.get(unit);
  if (mass !== undefined) {
    return measuredQuantity(quantity * mass.grams, mass.source);
  }

  const measure = rule?.measures?.[unit];
  if (measure !== undefined) {
    return typeof measure === 'number'
      ? measuredQuantity(quantity * measure, 'household_measure')
      : measuredQuantity(quantity * measure.grams, measure.source);
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
  source: QuantitySource,
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
  matches: ReadonlyArray<NutritionDatabaseMatch>,
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
  const words = normaliseName(value)
    .split(' ')
    .filter(
      (word) =>
        !ignoredNameWords.has(word) &&
        !/^\d+(?:\.\d+)?(?:cm|mm|in)$/u.test(word),
    );

  while (words[0] === 'and' || words[0] === 'or') words.shift();
  while (words.at(-1) === 'and' || words.at(-1) === 'or') words.pop();
  return words.join(' ');
}

function singular(value: string): string {
  if (value === 'leaves') return 'leaf';
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
