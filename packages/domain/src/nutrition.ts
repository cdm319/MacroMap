import type {
  RecipeIngredient,
  RecipeNutrition,
  RecipeNutritionProvenance,
} from '@macromap/contracts';
import { cofid2021Rows } from '@macromap/domain/cofid-2021-data';
import {
  everydayIngredientRules,
  freshHerbMeasures,
  type IngredientRule,
} from '@macromap/domain/nutrition-rules';

interface NutritionFood {
  readonly carbsThousandths: number;
  readonly code: string;
  readonly fatThousandths: number;
  readonly foodSource: 'cofid' | 'label';
  readonly foodVersion: string;
  readonly kcalThousandths: number;
  readonly name: string;
  readonly proteinThousandths: number;
}

type NutritionDatabaseProvenance = Extract<
  RecipeNutritionProvenance,
  { source: 'nutrition_database' }
>;
type NutritionDatabaseMatch = NutritionDatabaseProvenance['matches'][number];
type QuantitySource = NutritionDatabaseMatch['quantitySource'];

interface FoodMatch {
  readonly confidence: 'high' | 'low' | 'medium';
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

// Label source: data/household-label-profiles.md
const labelFoods: NutritionFood[] = [
  labelFood(
    'generic-almond-milk',
    'Generic almond milk',
    15,
    0.5,
    0,
    1.1,
    '2026-08-19',
  ),
  labelFood('generic-onion-granules', 'Generic onion granules', 337, 10, 64, 1),
  labelFood('generic-chilli-flakes', 'Generic chilli flakes', 376, 12, 29, 17),
  labelFood('generic-maple-syrup', 'Generic maple syrup', 270, 0, 67, 0.1),
  labelFood(
    'generic-fish-sauce',
    'Generic fish sauce',
    63.478,
    5.739,
    10.087,
    0.435,
  ),
  labelFood(
    'generic-garam-masala',
    'Generic garam masala',
    335,
    13.7,
    20,
    13.8,
  ),
  labelFood(
    'generic-curry-powder',
    'Generic curry powder',
    318,
    11.1,
    26.9,
    11.8,
  ),
  labelFood(
    'beef-stock-cube',
    'Beef stock, prepared from a cube',
    8,
    0.5,
    1,
    0.15,
    '2026-08-19',
  ),
  labelFood(
    'chicken-stock-cube',
    'Chicken stock, prepared from a cube',
    8.5,
    0.35,
    1.4,
    0.285,
    '2026-08-19',
  ),
  labelFood(
    'generic-turkey-mince',
    'Generic turkey mince',
    119,
    27,
    0.5,
    1.2,
    '2026-08-19',
  ),
  labelFood(
    'generic-protein-powder',
    'Generic protein powder',
    371,
    74,
    6.8,
    4.5,
    '2026-08-19',
  ),
  labelFood(
    'reference-chipotle-paste',
    'Reference chipotle paste',
    171,
    2.5,
    26.7,
    5.1,
  ),
  labelFood(
    'reference-coconut-water',
    'Reference coconut water',
    18,
    0,
    4.5,
    0,
  ),
  labelFood(
    'reference-chia-seeds',
    'Reference chia seeds',
    422,
    23.9,
    2.4,
    27.7,
  ),
  labelFood('reference-baby-corn', 'Reference baby corn', 47, 2.6, 6.5, 0.4),
  labelFood(
    'reference-lemongrass',
    'Reference lemongrass',
    113,
    1.8,
    25.3,
    0.5,
  ),
  labelFood('reference-sea-bass', 'Reference raw sea bass', 128, 23.6, 0, 3.6),
  labelFood(
    'reference-hoisin-sauce',
    'Reference hoisin sauce',
    308,
    2.5,
    70,
    2,
  ),
  labelFood('reference-oat-drink', 'Reference oat drink', 49, 1, 6.4, 2.1),
  labelFood(
    'reference-coconut-drink',
    'Reference coconut drink',
    20,
    0.1,
    2.7,
    0.8,
  ),
  labelFood('reference-flaxseed', 'Reference flaxseed', 505, 24.1, 4.9, 38.1),
  labelFood('reference-hemp-seed', 'Reference hemp seed', 605, 33, 1.9, 51),
  labelFood(
    'reference-coconut-flour',
    'Reference coconut flour',
    390,
    15.3,
    14.7,
    21.1,
  ),
  labelFood(
    'reference-cajun-seasoning',
    'Reference Cajun seasoning',
    314,
    10.9,
    45.9,
    6.5,
  ),
  labelFood(
    'reference-jerk-seasoning',
    'Reference jerk seasoning',
    209,
    4.5,
    24,
    5.9,
  ),
  labelFood('reference-prosciutto', 'Reference prosciutto', 243, 26.6, 0.3, 15),
  labelFood(
    'heck-chicken-italia',
    'HECK Chicken Italia sausage, raw-weight equivalent',
    99.953,
    16.094,
    2.88,
    2.287,
  ),
];

function labelFood(
  code: string,
  name: string,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  foodVersion = '2026-08-20',
): NutritionFood {
  return {
    carbsThousandths: Math.round(carbs * 1_000),
    code,
    fatThousandths: Math.round(fat * 1_000),
    foodSource: 'label',
    foodVersion,
    kcalThousandths: Math.round(kcal * 1_000),
    name,
    proteinThousandths: Math.round(protein * 1_000),
  };
}
const foods: NutritionFood[] = [
  ...cofid2021Rows.trim().split('\n').map(readFood),
  ...labelFoods,
];
const foodsByCode = new Map(foods.map((food) => [food.code, food]));
const foodsByName = new Map<string, NutritionFood[]>();

for (const food of foods) {
  const name = normaliseName(food.name);
  foodsByName.set(name, [...(foodsByName.get(name) ?? []), food]);
}

const ingredientRules: ReadonlyArray<IngredientRule> = [
  {
    aliases: ['almond milk'],
    foodCode: 'generic-almond-milk',
    gramsPerMillilitre: 1,
    matchConfidence: 'high',
    volumeSource: 'label_measure',
  },
  reviewedCount(['apple'], '14-319', 150),
  reviewedCount(['avocado'], '14-386', 150),
  {
    aliases: ['baked beans', 'heinz baked beans'],
    foodCode: '13-532',
    measures: { can: 400, tin: 400 },
  },
  reviewedCount(['baking potato'], '13-489', 250),
  reviewedCount(['banana'], '14-318', 120),
  { aliases: ['basmati rice'], foodCode: '11-857' },
  {
    aliases: ['basil', 'basil leaf', 'fresh basil'],
    countGrams: 5,
    foodCode: '13-804',
    gramsPerMillilitre: 0.07,
    measures: freshHerbMeasures,
  },
  {
    aliases: ['baby potato', 'baby new potato', 'new potato'],
    foodCode: '13-618',
  },
  {
    aliases: ['baby corn', 'baby sweetcorn'],
    countGrams: 10,
    countSource: 'household_measure',
    foodCode: 'reference-baby-corn',
    measures: { packet: 175 },
  },
  { aliases: ['beef mince', 'minced beef'], foodCode: '18-469' },
  { aliases: ['lean diced beef'], foodCode: '18-468' },
  {
    aliases: ['beef stock', 'beef stock cube'],
    countGrams: 200,
    countSource: 'label_measure',
    foodCode: 'beef-stock-cube',
    gramsPerMillilitre: 1,
    matchConfidence: 'high',
    volumeSource: 'label_measure',
  },
  {
    aliases: ['blueberry', 'blueberries'],
    foodCode: '14-325',
    gramsPerMillilitre: 0.62,
  },
  {
    aliases: ['broccoli', 'tenderstem broccoli'],
    countGrams: 100,
    foodCode: '13-502',
    measures: { handful: 80 },
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
  reviewedCount(['carrot'], '13-496', 80),
  {
    aliases: ['cashew', 'cashew nut'],
    foodCode: '14-811',
    gramsPerMillilitre: 0.57,
  },
  {
    aliases: ['chia seed'],
    foodCode: 'reference-chia-seeds',
    gramsPerMillilitre: 0.65,
  },
  {
    aliases: ['cheddar', 'cheddar cheese'],
    foodCode: '12-346',
    gramsPerMillilitre: 0.46,
  },
  { aliases: ['halloumi', 'halloumi cheese'], foodCode: '12-496' },
  reviewedCount(['chicken breast', 'chicken breast fillet'], '18-290', 200),
  {
    aliases: ['chicken stock', 'chicken stock cube'],
    countGrams: 200,
    countSource: 'label_measure',
    foodCode: 'chicken-stock-cube',
    gramsPerMillilitre: 1,
    matchConfidence: 'high',
    volumeSource: 'label_measure',
  },
  {
    aliases: [
      'chicken sausage',
      'heck chicken italia',
      'heck chicken italia sausage',
      'heck chicken sausage',
      'heck reduced fat sausage',
    ],
    countGrams: 42.5,
    countSource: 'label_measure',
    foodCode: 'heck-chicken-italia',
    matchConfidence: 'high',
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
    aliases: [
      'reduced fat coconut milk',
      'tin of reduced fat coconut milk',
      'tinned reduced fat coconut milk',
    ],
    foodCode: '14-890',
    gramsPerMillilitre: 0.97,
  },
  {
    aliases: ['coconut water'],
    foodCode: 'reference-coconut-water',
    gramsPerMillilitre: 1,
  },
  {
    aliases: ['desiccated coconut'],
    foodCode: '14-873',
  },
  {
    aliases: ['coconut oil'],
    countGrams: 14,
    foodCode: '17-031',
    gramsPerMillilitre: 0.92,
  },
  {
    aliases: ['coconut drink', 'coconut milk drink'],
    foodCode: 'reference-coconut-drink',
    gramsPerMillilitre: 1,
  },
  {
    aliases: ['coconut flour'],
    foodCode: 'reference-coconut-flour',
    gramsPerMillilitre: 0.5,
  },
  {
    aliases: ['cooked basmati rice', 'pre cooked rice'],
    foodCode: '11-858',
    gramsPerMillilitre: 0.67,
  },
  {
    aliases: ['coriander', 'coriander leaf', 'fresh coriander'],
    countGrams: 5,
    foodCode: '13-888',
    gramsPerMillilitre: 0.07,
    measures: freshHerbMeasures,
  },
  {
    aliases: ['cacao powder', 'cocoa powder'],
    foodCode: '12-545',
    gramsPerMillilitre: 0.45,
  },
  {
    aliases: ['corn flour', 'cornflour'],
    foodCode: '11-1045',
    gramsPerMillilitre: 0.55,
  },
  {
    aliases: ['curry powder', 'hot curry powder', 'mild curry powder'],
    foodCode: 'generic-curry-powder',
    gramsPerMillilitre: 0.4,
    matchConfidence: 'high',
  },
  {
    aliases: ['chipotle paste'],
    foodCode: 'reference-chipotle-paste',
    gramsPerMillilitre: 1.1,
  },
  reviewedCount(['egg'], '12-937', 60),
  reviewedCount(['large egg'], '12-937', 70),
  {
    aliases: ['cannellini bean'],
    countGrams: 240,
    countSource: 'household_measure',
    foodCode: '13-666',
    measures: { can: 240, tin: 240 },
  },
  {
    aliases: ['chickpea'],
    countGrams: 240,
    countSource: 'household_measure',
    foodCode: '13-670',
    measures: { can: 240, tin: 240 },
  },
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
      'chocolate protein',
      'vanilla protein',
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
    aliases: ['egg noodle', 'fresh egg noodle'],
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
    foodCode: 'generic-garam-masala',
    gramsPerMillilitre: 0.4,
    matchConfidence: 'high',
  },
  {
    aliases: ['cajun seasoning', 'cajun spice'],
    foodCode: 'reference-cajun-seasoning',
    gramsPerMillilitre: 0.45,
  },
  {
    aliases: ['jerk seasoning', 'jerk spice'],
    foodCode: 'reference-jerk-seasoning',
    gramsPerMillilitre: 0.45,
  },
  {
    aliases: ['garlic', 'garlic clove', 'minced garlic'],
    foodCode: '13-244',
    countGrams: 3,
    countSource: 'household_measure',
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
  {
    aliases: ['hemp seed'],
    foodCode: 'reference-hemp-seed',
    gramsPerMillilitre: 0.65,
  },
  {
    aliases: ['hoisin', 'hoisin sauce'],
    foodCode: 'reference-hoisin-sauce',
    gramsPerMillilitre: 1,
  },
  {
    aliases: ['maple syrup'],
    foodCode: 'generic-maple-syrup',
    gramsPerMillilitre: 1.35,
    matchConfidence: 'high',
  },
  {
    aliases: ['lemon', 'lemon juice', 'lemon juice of'],
    countGrams: 58,
    countSource: 'household_measure',
    foodCode: '14-130',
    gramsPerMillilitre: 1,
  },
  {
    aliases: ['lemongrass', 'lemongrass stalk'],
    countGrams: 12,
    countSource: 'household_measure',
    foodCode: 'reference-lemongrass',
    gramsPerMillilitre: 0.6,
  },
  {
    aliases: ['lime', 'lime juice', 'lime juice of'],
    countGrams: 44,
    countSource: 'household_measure',
    foodCode: '14-131',
    gramsPerMillilitre: 1,
  },
  { aliases: ['mangetout'], foodCode: '13-122' },
  {
    aliases: ['olive oil'],
    foodCode: '17-038',
    gramsPerMillilitre: 0.91,
  },
  {
    aliases: ['oat drink', 'oat milk'],
    foodCode: 'reference-oat-drink',
    gramsPerMillilitre: 1,
  },
  {
    aliases: ['onion granule', 'onion powder'],
    foodCode: 'generic-onion-granules',
    gramsPerMillilitre: 7 / 15,
    matchConfidence: 'high',
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
    aliases: ['parsley', 'parsley leaf', 'fresh parsley'],
    countGrams: 5,
    foodCode: '13-844',
    gramsPerMillilitre: 0.07,
    measures: freshHerbMeasures,
  },
  {
    aliases: ['pesto'],
    foodCode: '17-622',
    gramsPerMillilitre: 1.05,
  },
  {
    aliases: ['flax seed', 'flaxseed', 'ground flaxseed'],
    foodCode: 'reference-flaxseed',
    gramsPerMillilitre: 0.65,
  },
  {
    aliases: ['passata', 'canned tomato'],
    countGrams: 500,
    foodCode: '13-530',
    gramsPerMillilitre: 1,
  },
  {
    aliases: ['plain flour', 'white flour'],
    foodCode: '11-886',
    gramsPerMillilitre: 0.53,
  },
  reviewedCount(['potato'], '13-489', 175),
  { aliases: ['pork fillet'], countGrams: 150, foodCode: '18-510' },
  {
    aliases: ['prosciutto'],
    countGrams: 14,
    countSource: 'label_measure',
    foodCode: 'reference-prosciutto',
  },
  {
    aliases: ['rapeseed oil'],
    countGrams: 14,
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
  reviewedCount(['red pepper'], '13-524', 160),
  {
    aliases: [
      'bell pepper',
      'green bell pepper',
      'green pepper',
      'yellow pepper',
    ],
    countGrams: 160,
    countSource: 'household_measure',
    foodCode: '13-524',
  },
  {
    aliases: ['rolled oat', 'oat', 'porridge oat'],
    foodCode: '11-788',
    gramsPerMillilitre: 0.34,
  },
  reviewedCount(['salmon', 'salmon fillet'], '16-356', 120),
  {
    aliases: ['sea bass', 'sea bass fillet'],
    countGrams: 150,
    foodCode: 'reference-sea-bass',
  },
  {
    aliases: ['milk', 'semi skimmed milk'],
    foodCode: '12-313',
    gramsPerMillilitre: 1.03,
  },
  {
    aliases: ['skimmed milk'],
    foodCode: '12-307',
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
    aliases: [
      'soy sauce',
      'light soy sauce',
      'dark soy sauce',
      'low salt soy sauce',
    ],
    foodCode: '17-721',
    gramsPerMillilitre: 1.16,
  },
  {
    aliases: ['fish sauce'],
    foodCode: 'generic-fish-sauce',
    gramsPerMillilitre: 1.15,
    matchConfidence: 'high',
  },
  {
    aliases: ['sriracha'],
    foodCode: '17-719',
    gramsPerMillilitre: 1.1,
  },
  {
    aliases: ['spinach', 'baby spinach', 'baby spinach leaf'],
    foodCode: '13-521',
    measures: { handful: 30 },
  },
  { aliases: ['spring onion'], foodCode: '13-352', countGrams: 15 },
  {
    aliases: ['rosemary', 'fresh rosemary'],
    countGrams: 5,
    foodCode: '13-892',
    gramsPerMillilitre: 0.07,
    measures: freshHerbMeasures,
  },
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
  reviewedCount(['sweet potato'], '13-463', 200),
  { aliases: ['sweetcorn'], foodCode: '13-622' },
  {
    aliases: ['sunflower oil'],
    foodCode: '17-045',
    gramsPerMillilitre: 0.91,
  },
  { aliases: ['tomato'], foodCode: '13-517', countGrams: 100 },
  reviewedCount(['cherry tomato'], '13-517', 20),
  {
    aliases: ['tomato puree'],
    foodCode: '13-531',
    gramsPerMillilitre: 1.05,
  },
  { aliases: ['tuna steak'], foodCode: '16-399' },
  { aliases: ['turkey breast'], foodCode: '18-349' },
  {
    aliases: [
      'chilli flake',
      'crushed chilli',
      'crushed chillies',
      'dried chilli flake',
    ],
    foodCode: 'generic-chilli-flakes',
    gramsPerMillilitre: 0.4,
    matchConfidence: 'high',
  },
  {
    aliases: ['turkey mince', 'lean turkey mince', 'minced turkey'],
    foodCode: 'generic-turkey-mince',
    matchConfidence: 'high',
  },
  {
    aliases: ['vegetable oil', 'sunflower or vegetable oil for frying'],
    foodCode: '17-686',
    gramsPerMillilitre: 0.91,
  },
  {
    aliases: [
      'vinegar',
      'apple cider vinegar',
      'balsamic vinegar',
      'cider vinegar',
      'rice vinegar',
      'rice wine vinegar',
      'red wine vinegar',
      'white wine vinegar',
      'wine vinegar',
    ],
    foodCode: '17-339',
    gramsPerMillilitre: 1,
  },
  {
    aliases: ['ice', 'water'],
    foodCode: '17-377',
    gramsPerMillilitre: 1,
    measures: { handful: 30 },
  },
  { aliases: ['walnut'], foodCode: '14-879' },
  {
    aliases: ['peanut butter', 'smooth peanut butter'],
    foodCode: '14-892',
    gramsPerMillilitre: 1.05,
  },
  { aliases: ['white rice'], foodCode: '11-861' },
  {
    aliases: ['whole milk'],
    foodCode: '12-596',
    gramsPerMillilitre: 1.03,
  },
  ...everydayIngredientRules,
];

function reviewedCount(
  aliases: ReadonlyArray<string>,
  foodCode: string,
  countGrams: number,
): IngredientRule {
  return { aliases, countGrams, countSource: 'household_measure', foodCode };
}

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
  'large',
  'medium',
  'melted',
  'organic',
  'of',
  'peeled',
  'piece',
  'roughly',
  'serve',
  'skinless',
  'small',
  'sliced',
  'trimmed',
  'unwaxed',
  'virgin',
  'zested',
]);

const aliases = new Map<string, IngredientRule>();
for (const rule of ingredientRules) {
  for (const alias of rule.aliases ?? []) {
    aliases.set(normaliseName(alias), rule);
  }
}

const negligibleSeasonings = new Set(
  [
    'allspice',
    'anise',
    'baking powder',
    'bicarbonate of soda',
    'black pepper',
    'black peppercorn',
    'cardamom',
    'cardamom pod',
    'cayenne pepper',
    'chilli powder',
    'chilli powder salt and pepper',
    'cinnamon',
    'cinnamon stick',
    'coriander seed',
    'cumin',
    'cumin powder',
    'cumin seed',
    'fennel',
    'fennel seed',
    'five spice',
    'chinese five spice',
    'ground cardamom',
    'ground cinnamon',
    'ground coriander',
    'ground cumin',
    'mixed herb',
    'oregano',
    'dried oregano',
    'paprika',
    'hot paprika',
    'pepper',
    'pink peppercorn',
    'saffron',
    'saffron strand',
    'salt',
    'salt and black pepper',
    'salt and pepper',
    'sea salt',
    'smoked paprika',
    'star anise',
    'stick of cinnamon',
    'sprig of fresh oregano',
    'sweet smoked paprika',
    'sichuan peppercorn',
    'turmeric',
    'vanilla extract',
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

const defaultMeasureGrams = new Map([
  ['bottle', 500],
  ['bunch', 30],
  ['can', 400],
  ['clove', 3],
  ['cm', 5],
  ['handful', 30],
  ['item', 100],
  ['packet', 250],
  ['pinch', 0.5],
  ['slice', 30],
  ['sprig', 1],
  ['tin', 400],
  ['unit', 100],
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

    totals.kcal += quantity.milligrams * BigInt(match.food.kcalThousandths);
    totals.protein +=
      quantity.milligrams * BigInt(match.food.proteinThousandths);
    totals.carbs += quantity.milligrams * BigInt(match.food.carbsThousandths);
    totals.fat += quantity.milligrams * BigInt(match.food.fatThousandths);
    matches.push({
      canonicalName: normaliseIngredientName(ingredient.name),
      foodCode: match.food.code,
      foodName: match.food.name,
      foodSource: match.food.foodSource,
      foodVersion: match.food.foodVersion,
      grams: Number(quantity.milligrams) / 1_000,
      ingredientIndex,
      matchConfidence: quantity.assumed ? 'low' : match.confidence,
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
    Number(roundDivide(value * 100n, denominator)) / 100;
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
    carbsThousandths: Number(cells[4]) * 10,
    code: cells[0]!,
    fatThousandths: Number(cells[5]) * 10,
    foodSource: 'cofid',
    foodVersion: '2021',
    kcalThousandths: Number(cells[2]) * 10,
    name: cells[1]!,
    proteinThousandths: Number(cells[3]) * 10,
  };
}

function matchFood(ingredientName: string): FoodMatch | null {
  const name = normaliseName(ingredientName);
  const rule = findIngredientRule(ingredientName);
  const ruleFood =
    rule === undefined ? undefined : foodsByCode.get(rule.foodCode);
  if (rule !== undefined && ruleFood?.foodSource === 'label') {
    return {
      confidence: rule.matchConfidence ?? 'medium',
      food: ruleFood,
      rule,
    };
  }
  const exact = foodsByName.get(name);
  if (exact?.length === 1) {
    return {
      confidence: 'high',
      food: exact[0]!,
      ...(rule === undefined ? {} : { rule }),
    };
  }

  if (rule === undefined) return null;
  return ruleFood === undefined
    ? null
    : { confidence: rule.matchConfidence ?? 'medium', food: ruleFood, rule };
}

function findIngredientRule(
  ingredientName: string,
): IngredientRule | undefined {
  const direct = aliases.get(normaliseName(ingredientName));
  if (direct !== undefined) return direct;
  const normalised = normaliseIngredientName(ingredientName);
  return (
    aliases.get(normalised) ??
    ingredientRules.find(({ pattern }) => pattern?.test(normalised))
  );
}

function normaliseQuantity(
  ingredient: RecipeIngredient,
  rule: IngredientRule | undefined,
): {
  readonly assumed: boolean;
  readonly milligrams: bigint;
  readonly source: QuantitySource;
} | null {
  const { quantity } = ingredient;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const unit = ingredient.unit.trim().toLowerCase();
  const mass = massUnits.get(unit);
  if (mass !== undefined) {
    return measuredQuantity(quantity * mass.grams, mass.source, false);
  }

  const measure = rule?.measures?.[unit];
  if (measure !== undefined) {
    return typeof measure === 'number'
      ? measuredQuantity(quantity * measure, 'household_measure')
      : measuredQuantity(quantity * measure.grams, measure.source, false);
  }

  const millilitres = volumeUnits.get(unit);
  if (millilitres !== undefined && rule?.gramsPerMillilitre !== undefined) {
    return measuredQuantity(
      quantity * millilitres * rule.gramsPerMillilitre,
      rule.volumeSource ?? 'household_measure',
      false,
    );
  }

  if (countUnits.has(unit) && rule?.countGrams !== undefined) {
    return measuredQuantity(
      quantity * rule.countGrams,
      rule.countSource ?? 'estimated_count',
      false,
    );
  }

  if (millilitres !== undefined) {
    return measuredQuantity(quantity * millilitres, 'household_measure', true);
  }

  const assumedGrams = defaultMeasureGrams.get(unit);
  if (assumedGrams !== undefined) {
    return measuredQuantity(
      quantity * assumedGrams,
      countUnits.has(unit) ? 'estimated_count' : 'household_measure',
      true,
    );
  }

  return null;
}

function measuredQuantity(
  grams: number,
  source: QuantitySource,
  assumed = false,
): {
  readonly assumed: boolean;
  readonly milligrams: bigint;
  readonly source: typeof source;
} | null {
  const milligrams = Math.round(grams * 1_000);
  return Number.isSafeInteger(milligrams) && milligrams > 0
    ? { assumed, milligrams: BigInt(milligrams), source }
    : null;
}

function isNegligibleSeasoning(ingredient: RecipeIngredient): boolean {
  const name = normaliseIngredientName(ingredient.name);
  if (!negligibleSeasonings.has(name)) return false;
  const match = matchFood(ingredient.name);
  const quantity = normaliseQuantity(ingredient, match?.rule);
  return quantity !== null && quantity.milligrams <= 10_000n;
}

function nutritionConfidence(
  matches: ReadonlyArray<NutritionDatabaseMatch>,
  omissions: ReadonlyArray<unknown>,
): 'high' | 'low' | 'medium' {
  if (
    matches.some(
      ({ matchConfidence, quantitySource }) =>
        matchConfidence === 'low' || quantitySource === 'estimated_count',
    )
  ) {
    return 'low';
  }
  return omissions.length > 0 ||
    matches.some(
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
  if (value === 'couscous') return value;
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
