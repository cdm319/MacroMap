import { describe, expect, it } from 'vitest';
import { estimateRecipeNutrition } from './nutrition.js';

describe('nutrition database estimation', () => {
  it('calculates reproducible per-serving macros using fixed-point arithmetic', () => {
    const result = estimateRecipeNutrition(
      [
        { name: 'pasta', preparationNote: '', quantity: 200, unit: 'g' },
        { name: 'tomatoes', preparationNote: '', quantity: 400, unit: 'g' },
      ],
      2,
    );

    expect(result).toMatchObject({
      kind: 'estimated',
      nutrition: {
        carbsGrams: 81.6,
        fatGrams: 1.8,
        kcal: 371,
        proteinGrams: 12.3,
      },
      provenance: {
        confidence: 'medium',
        matches: [
          { foodCode: '11-716', grams: 200, matchConfidence: 'medium' },
          { foodCode: '13-517', grams: 400, matchConfidence: 'medium' },
        ],
        source: 'nutrition_database',
      },
    });
  });

  it('uses the supplied protein powder label for grams and scoops', () => {
    const grams = estimateRecipeNutrition(
      [ingredient(30, 'g', 'vanilla protein powder')],
      1,
    );
    const scoops = estimateRecipeNutrition(
      [ingredient(2, 'scoops', 'protein powder chocolate')],
      1,
    );

    expect(grams).toMatchObject({
      kind: 'estimated',
      nutrition: {
        carbsGrams: 2.04,
        fatGrams: 1.35,
        kcal: 111.3,
        proteinGrams: 22.2,
      },
      provenance: {
        confidence: 'high',
        matches: [
          {
            foodCode: 'generic-protein-powder',
            foodSource: 'label',
            foodVersion: '2026-08-19',
            matchConfidence: 'high',
            quantitySource: 'metric',
          },
        ],
        source: 'nutrition_database',
      },
    });
    expect(scoops).toMatchObject({
      kind: 'estimated',
      nutrition: {
        carbsGrams: 4.08,
        fatGrams: 2.7,
        kcal: 222.6,
        proteinGrams: 44.4,
      },
      provenance: {
        confidence: 'high',
        matches: [{ grams: 60, quantitySource: 'label_measure' }],
      },
    });
  });

  it('uses the supplied everyday label profiles', () => {
    expect(
      estimateRecipeNutrition([ingredient(100, 'ml', 'almond milk')], 1),
    ).toMatchObject({
      kind: 'estimated',
      nutrition: {
        carbsGrams: 0,
        fatGrams: 1.1,
        kcal: 15,
        proteinGrams: 0.5,
      },
      provenance: {
        confidence: 'high',
        matches: [{ foodCode: 'generic-almond-milk', foodSource: 'label' }],
      },
    });
    expect(
      estimateRecipeNutrition([ingredient(200, 'ml', 'beef stock')], 1),
    ).toMatchObject({
      kind: 'estimated',
      nutrition: {
        carbsGrams: 2,
        fatGrams: 0.3,
        kcal: 16,
        proteinGrams: 1,
      },
      provenance: {
        matches: [{ foodCode: 'beef-stock-cube', grams: 200 }],
      },
    });
    expect(
      estimateRecipeNutrition([ingredient(1, 'item', 'chicken stock cube')], 1),
    ).toMatchObject({
      kind: 'estimated',
      nutrition: {
        carbsGrams: 2.8,
        fatGrams: 0.57,
        kcal: 17,
        proteinGrams: 0.7,
      },
      provenance: {
        matches: [
          {
            foodCode: 'chicken-stock-cube',
            grams: 200,
            quantitySource: 'label_measure',
          },
        ],
      },
    });
    expect(
      estimateRecipeNutrition([ingredient(100, 'g', 'turkey mince')], 1),
    ).toMatchObject({
      kind: 'estimated',
      nutrition: {
        carbsGrams: 0.5,
        fatGrams: 1.2,
        kcal: 119,
        proteinGrams: 27,
      },
      provenance: {
        confidence: 'high',
        matches: [{ foodCode: 'generic-turkey-mince', foodSource: 'label' }],
      },
    });
    expect(
      estimateRecipeNutrition(
        [
          ingredient(1, 'tbsp', 'onion granules'),
          ingredient(1, 'tsp', 'chilli flakes'),
        ],
        1,
      ),
    ).toMatchObject({
      kind: 'estimated',
      nutrition: {
        carbsGrams: 5.06,
        fatGrams: 0.41,
        kcal: 31.11,
        proteinGrams: 0.94,
      },
      provenance: {
        confidence: 'medium',
        matches: [
          {
            foodCode: 'generic-onion-granules',
            foodSource: 'label',
            grams: 7,
            matchConfidence: 'high',
            quantitySource: 'household_measure',
          },
          {
            foodCode: 'generic-chilli-flakes',
            foodSource: 'label',
            grams: 2,
            matchConfidence: 'high',
            quantitySource: 'household_measure',
          },
        ],
      },
    });
    expect(
      estimateRecipeNutrition([ingredient(100, 'g', 'maple syrup')], 1),
    ).toMatchObject({
      kind: 'estimated',
      nutrition: {
        carbsGrams: 67,
        fatGrams: 0.1,
        kcal: 270,
        proteinGrams: 0,
      },
      provenance: {
        confidence: 'high',
        matches: [{ foodCode: 'generic-maple-syrup', foodSource: 'label' }],
      },
    });
    expect(
      estimateRecipeNutrition([ingredient(100, 'ml', 'fish sauce')], 1),
    ).toMatchObject({
      kind: 'estimated',
      nutrition: {
        carbsGrams: 11.6,
        fatGrams: 0.5,
        kcal: 73,
        proteinGrams: 6.6,
      },
      provenance: {
        confidence: 'medium',
        matches: [
          {
            foodCode: 'generic-fish-sauce',
            foodSource: 'label',
            quantitySource: 'household_measure',
          },
        ],
      },
    });
  });

  it('uses the approved macro-equivalent ingredient mappings', () => {
    const foods = [
      ['basil', '13-804'],
      ['parsley', '13-844'],
      ['fresh coriander', '13-888'],
      ['rosemary', '13-892'],
      ['cacao powder', '12-545'],
      ['pesto', '17-622'],
      ['rice wine vinegar', '17-339'],
      ['lean diced beef', '18-468'],
      ['turkey breast', '18-349'],
      ['cannellini beans', '13-666'],
      ['chickpeas', '13-670'],
      ['cherry tomatoes', '13-517'],
      ['milk', '12-313'],
      ['sriracha', '17-719'],
      ['drinking chocolate', '17-498'],
      ['egg white', '12-938'],
      ['egg yolk', '12-939'],
    ] as const;

    for (const [name, foodCode] of foods) {
      expect(
        estimateRecipeNutrition([ingredient(100, 'g', name)], 1),
      ).toMatchObject({
        kind: 'estimated',
        provenance: { matches: [{ foodCode, matchConfidence: 'medium' }] },
      });
    }
  });

  it('uses approved UK reference labels at medium confidence', () => {
    const foods = [
      ['chipotle paste', 'g', 'reference-chipotle-paste', 171, 2.5, 26.7, 5.1],
      ['coconut water', 'ml', 'reference-coconut-water', 18, 0, 4.5, 0],
      ['chia seeds', 'g', 'reference-chia-seeds', 422, 23.9, 2.4, 27.7],
      ['baby corn', 'g', 'reference-baby-corn', 47, 2.6, 6.5, 0.4],
      ['lemongrass', 'g', 'reference-lemongrass', 113, 1.8, 25.3, 0.5],
      ['sea bass', 'g', 'reference-sea-bass', 128, 23.6, 0, 3.6],
      ['hoisin sauce', 'ml', 'reference-hoisin-sauce', 308, 2.5, 70, 2],
      ['oat milk', 'ml', 'reference-oat-drink', 49, 1, 6.4, 2.1],
      [
        'coconut milk drink',
        'ml',
        'reference-coconut-drink',
        20,
        0.1,
        2.7,
        0.8,
      ],
      ['flaxseed', 'g', 'reference-flaxseed', 505, 24.1, 4.9, 38.1],
      ['hemp seeds', 'g', 'reference-hemp-seed', 605, 33, 1.9, 51],
      ['coconut flour', 'g', 'reference-coconut-flour', 390, 15.3, 14.7, 21.1],
      [
        'cajun seasoning',
        'g',
        'reference-cajun-seasoning',
        314,
        10.9,
        45.9,
        6.5,
      ],
      ['jerk seasoning', 'g', 'reference-jerk-seasoning', 209, 4.5, 24, 5.9],
      ['prosciutto', 'g', 'reference-prosciutto', 243, 26.6, 0.3, 15],
      ['smoked paprika', 'g', 'reference-smoked-paprika', 324, 14.8, 18.3, 13],
      ['mirin', 'ml', 'reference-mirin', 272, 0, 68, 0],
      ['ketjap manis', 'ml', 'reference-ketjap-manis', 139, 1.2, 33.2, 0.1],
      ['harissa paste', 'g', 'reference-harissa', 97, 1.8, 10.5, 4.6],
      ['mixed berries', 'g', 'reference-mixed-berries', 56, 0.8, 11, 0.5],
      ['cooked quinoa', 'g', 'reference-cooked-quinoa', 141, 4.3, 22.7, 2.7],
      ['chicken thighs', 'g', 'reference-raw-chicken-thigh', 161, 18.3, 0, 9.8],
      ['almond butter', 'g', 'reference-almond-butter', 577, 21, 5.9, 52],
      ['hazelnut butter', 'g', 'reference-hazelnut-butter', 690, 19, 2.4, 65],
    ] as const;

    for (const [name, unit, foodCode, kcal, protein, carbs, fat] of foods) {
      expect(
        estimateRecipeNutrition([ingredient(100, unit, name)], 1),
      ).toMatchObject({
        kind: 'estimated',
        nutrition: {
          carbsGrams: carbs,
          fatGrams: fat,
          kcal,
          proteinGrams: protein,
        },
        provenance: {
          confidence: 'medium',
          matches: [
            {
              foodCode,
              foodSource: 'label',
              foodVersion: '2026-08-20',
              matchConfidence: 'medium',
            },
          ],
        },
      });
    }
  });

  it('uses the approved label measures for spices, nut butters, and prosciutto', () => {
    const spices = estimateRecipeNutrition(
      [
        ingredient(1, 'tsp', 'Cajun seasoning'),
        ingredient(1, 'tsp', 'jerk seasoning'),
      ],
      1,
    );
    const measured = estimateRecipeNutrition(
      [
        ingredient(2, 'slices', 'prosciutto'),
        ingredient(1, 'tbsp', 'almond butter'),
        ingredient(1, 'tbsp', 'hazelnut butter'),
      ],
      1,
    );

    expect(spices).toMatchObject({
      kind: 'estimated',
      provenance: {
        confidence: 'medium',
        matches: [
          {
            foodCode: 'reference-cajun-seasoning',
            grams: 2.25,
            quantitySource: 'household_measure',
          },
          {
            foodCode: 'reference-jerk-seasoning',
            grams: 2.25,
            quantitySource: 'household_measure',
          },
        ],
      },
    });
    expect(measured).toMatchObject({
      kind: 'estimated',
      provenance: {
        confidence: 'medium',
        matches: [
          {
            foodCode: 'reference-prosciutto',
            grams: 28,
            quantitySource: 'label_measure',
          },
          {
            foodCode: 'reference-almond-butter',
            grams: 15,
            quantitySource: 'label_measure',
          },
          {
            foodCode: 'reference-hazelnut-butter',
            grams: 15,
            quantitySource: 'label_measure',
          },
        ],
      },
    });
  });

  it('uses the HECK Chicken Italia label for weights and sausage counts', () => {
    const grams = estimateRecipeNutrition(
      [ingredient(255, 'g', 'chicken sausages')],
      1,
    );
    const sausages = estimateRecipeNutrition(
      [ingredient(6, 'items', 'HECK Chicken Italia sausages')],
      1,
    );

    expect(grams).toMatchObject({
      kind: 'estimated',
      nutrition: {
        carbsGrams: 7.34,
        fatGrams: 5.83,
        kcal: 254.88,
        proteinGrams: 41.04,
      },
      provenance: {
        confidence: 'high',
        matches: [
          {
            foodCode: 'heck-chicken-italia',
            foodSource: 'label',
            grams: 255,
            matchConfidence: 'high',
            quantitySource: 'metric',
          },
        ],
      },
    });
    expect(sausages).toMatchObject({
      kind: 'estimated',
      nutrition: grams.kind === 'estimated' ? grams.nutrition : {},
      provenance: {
        confidence: 'high',
        matches: [
          {
            foodCode: 'heck-chicken-italia',
            grams: 255,
            quantitySource: 'label_measure',
          },
        ],
      },
    });
  });

  it('always calculates calorie-dense seasoning exceptions', () => {
    const result = estimateRecipeNutrition(
      [
        ingredient(10, 'g', 'curry powder'),
        ingredient(10, 'g', 'garam masala'),
        ingredient(10, 'g', 'sesame seeds'),
      ],
      1,
    );

    expect(result).toMatchObject({
      kind: 'estimated',
      provenance: {
        matches: [
          { foodCode: 'generic-curry-powder', foodSource: 'label' },
          { foodCode: 'generic-garam-masala', foodSource: 'label' },
          { foodCode: '14-844' },
        ],
        source: 'nutrition_database',
      },
    });
    if (result.kind !== 'estimated') throw new Error('Expected an estimate.');
    expect(result.provenance.omissions).toBeUndefined();
  });

  it('uses household profiles for curry and chilli wording variants', () => {
    const foods = [
      ['mild curry powder', 'generic-curry-powder'],
      ['hot curry powder', 'generic-curry-powder'],
      ['dried chilli flakes', 'generic-chilli-flakes'],
      ['crushed chillies', 'generic-chilli-flakes'],
    ] as const;

    for (const [name, foodCode] of foods) {
      expect(
        estimateRecipeNutrition([ingredient(20, 'g', name)], 1),
      ).toMatchObject({
        kind: 'estimated',
        provenance: { matches: [{ foodCode, foodSource: 'label' }] },
      });
    }
  });

  it('uses validated household item weights at medium confidence', () => {
    const foods = [
      ['chicken breast', 200],
      ['cod fillet', 150],
      ['egg', 60],
      ['large egg', 70],
      ['garlic clove', 3],
      ['lemon', 58],
      ['lime', 44],
      ['banana', 120],
      ['sweet potato', 200],
      ['baking potato', 250],
      ['avocado', 150],
      ['burger bun', 70],
      ['bay leaf', 0.5],
      ['lemongrass stalk', 12],
      ['orange', 140],
      ['potato', 175],
      ['red pepper', 160],
      ['green bell pepper', 160],
      ['salmon fillet', 120],
      ['baby corn', 10],
      ['bacon medallion', 30],
      ['egg white', 40],
      ['egg yolk', 20],
      ['apple', 150],
      ['baby gem lettuce', 100],
      ['bagel', 90],
      ['cannelloni tube', 20],
      ['carrot', 80],
      ['cherry tomato', 20],
      ['chicken thigh', 100],
      ['chipolata sausage', 31.25],
      ['chorizo', 60],
      ['chorizo sausage', 60],
      ['crusty bread', 40],
      ['corncob', 60],
      ['English muffin', 70],
      ['flatbread', 70],
      ['pak choi', 150],
      ['leek', 125],
    ] as const;

    for (const [name, grams] of foods) {
      expect(
        estimateRecipeNutrition([ingredient(1, 'item', name)], 1),
      ).toMatchObject({
        kind: 'estimated',
        provenance: {
          confidence: 'medium',
          matches: [{ grams, quantitySource: 'household_measure' }],
        },
      });
    }
  });

  it('uses reviewed herb and tin measures', () => {
    const measures = [
      ['baked beans', 1, 'tin', 400],
      ['chickpeas', 1, 'tin', 240],
      ['cannellini beans', 1, 'can', 240],
      ['parsley', 1, 'handful', 15],
      ['basil', 0.5, 'handful', 7.5],
      ['fresh coriander', 1, 'packet', 30],
      ['fresh rosemary', 2, 'sprig', 2],
      ['baby corn', 1, 'packet', 175],
      ['desiccated coconut', 2, 'tbsp', 10.6],
      ['desiccated coconut', 2, 'tsp', 3.6],
      ['chipolata sausages', 10, 'item', 312.5],
      ['pork fillets', 2, 'item', 900],
      ['peppercorn sauce', 1, 'item', 180],
    ] as const;

    for (const [name, quantity, unit, grams] of measures) {
      expect(
        estimateRecipeNutrition([ingredient(quantity, unit, name)], 1),
      ).toMatchObject({
        kind: 'estimated',
        provenance: {
          confidence: 'medium',
          matches: [{ grams, quantitySource: 'household_measure' }],
        },
      });
    }
  });

  it('uses reviewed slice and packet measures', () => {
    const measures = [
      ['prosciutto', 2, 'slice', 28, 'label_measure'],
      ['crusty bread', 2, 'slice', 80, 'household_measure'],
      ['mozzarella', 1, 'packet', 125, 'household_measure'],
      ['mozzarrella', 1, 'packet', 125, 'household_measure'],
      ['cajun chicken mix', 1, 'packet', 45, 'label_measure'],
      ['old el paso chilli mix', 1, 'packet', 39, 'label_measure'],
      ["Colman's cottage pie sachet", 1, 'packet', 45, 'label_measure'],
      ["Nando's Medium Mix", 1, 'packet', 20, 'household_measure'],
      ['Tilda Rice packets', 2, 'item', 500, 'household_measure'],
      ['stock cube', 1, 'item', 200, 'household_measure'],
    ] as const;

    for (const [name, quantity, unit, grams, quantitySource] of measures) {
      expect(
        estimateRecipeNutrition([ingredient(quantity, unit, name)], 1),
      ).toMatchObject({
        kind: 'estimated',
        provenance: { matches: [{ grams, quantitySource }] },
      });
    }
  });

  it('recognises the protein powder wording used by the Paprika archive', () => {
    for (const name of [
      'protein powder',
      'chocolate protein powder',
      'vanilla protein powder',
      'strawberry or vanilla protein powder',
      'chocolate or vanilla protein powder',
      'protein powder chocolate',
    ]) {
      expect(
        estimateRecipeNutrition([ingredient(30, 'g', name)], 1),
      ).toMatchObject({
        kind: 'estimated',
        provenance: {
          matches: [{ foodCode: 'generic-protein-powder' }],
        },
      });
    }
  });

  it('matches unambiguous foods found by the Paprika audit', () => {
    const foods = [
      ['baby potatoes', '13-618'],
      ['tinned coconut milk', '14-889'],
      ['desiccated coconut', '14-873'],
      ['frozen peas', '13-527'],
      ['mangetout', '13-122'],
      ['dried orzo', '11-716'],
      ['pork fillet', '18-510'],
      ['raspberries', '14-375'],
      ['dried red lentils', '13-657'],
      ['porridge oats', '11-788'],
      ['baby spinach leaves', '13-521'],
      ['sweetcorn', '13-622'],
      ['tuna steak', '16-399'],
      ['walnuts', '14-879'],
      ['pre-cooked brown basmati rice', '11-869'],
      ['pre-cooked brown rice', '11-869'],
      ['microwave brown rice', '11-869'],
      ['amaranth seeds', 'reference-amaranth-grain'],
      ['peppercorn sauce', 'reference-peppercorn-sauce'],
      ['bamboo shoots', 'reference-bamboo-shoots'],
      ['quinoa (pre-cooked)', 'reference-cooked-quinoa'],
      ['sliced turkey', '19-543'],
      ['cooked penne', '11-1129'],
      ['noodles', '11-941'],
      ['garlic granules', '13-830'],
      ['dried coriander', '13-818'],
      ['low fat cream cheese', '12-537'],
    ] as const;

    for (const [name, foodCode] of foods) {
      expect(
        estimateRecipeNutrition([ingredient(100, 'g', name)], 1),
      ).toMatchObject({
        kind: 'estimated',
        provenance: { matches: [{ foodCode }] },
      });
    }
  });

  it('treats generic stevia as zero calorie', () => {
    const result = estimateRecipeNutrition(
      [ingredient(100, 'g', 'chicken breast'), ingredient(3, 'tbsp', 'stevia')],
      1,
    );

    expect(result).toMatchObject({
      kind: 'estimated',
      provenance: {
        matches: [
          { foodCode: '18-290' },
          { foodCode: 'generic-stevia', matchConfidence: 'high' },
        ],
      },
    });
    if (result.kind !== 'estimated') throw new Error('Expected an estimate.');
    expect(result.nutrition).toEqual(
      expect.objectContaining({
        carbsGrams: 0,
        fatGrams: 1.1,
        kcal: 106,
        proteinGrams: 24,
      }),
    );
  });

  it('omits small fresh oregano and Italian herb quantities', () => {
    const result = estimateRecipeNutrition(
      [
        ingredient(4, 'sprig', 'fresh oregano'),
        ingredient(1, 'tsp', 'Italian herb seasoning'),
        ingredient(100, 'g', 'chicken breast'),
      ],
      1,
    );

    expect(result).toMatchObject({
      kind: 'estimated',
      provenance: {
        omissions: [
          { ingredientName: 'fresh oregano' },
          { ingredientName: 'Italian herb seasoning' },
        ],
      },
    });
  });

  it('keeps genuine nutritional approximations at low confidence', () => {
    for (const name of ['jar tagine paste']) {
      expect(
        estimateRecipeNutrition([ingredient(100, 'g', name)], 1),
      ).toMatchObject({
        kind: 'estimated',
        provenance: {
          confidence: 'low',
          matches: [{ grams: 100, matchConfidence: 'low' }],
        },
      });
    }
  });

  it('treats literal wording variants as medium confidence', () => {
    const foods = [
      ['wholemeal penne', 100, 'g', '11-718', 100],
      ['cornflour mixed with water', 1, 'tbsp', '11-1045', 8.25],
      ['Worcester sauce', 1, 'tbsp', '17-723', 16.5],
      ['white fish', 100, 'g', '16-372', 100],
      ['couscous', 100, 'g', '11-901', 100],
      ['Thai red curry paste', 100, 'g', '17-720', 100],
      ['coconut sugar', 100, 'g', '17-063', 100],
      ['peanut butter', 100, 'g', '14-892', 100],
      ['skimmed milk', 100, 'ml', '12-307', 103],
      ['low-salt soy sauce', 1, 'tbsp', '17-721', 17.4],
      ['tinned reduced-fat coconut milk', 100, 'ml', '14-890', 97],
    ] as const;

    for (const [name, quantity, unit, foodCode, grams] of foods) {
      expect(
        estimateRecipeNutrition([ingredient(quantity, unit, name)], 1),
      ).toMatchObject({
        kind: 'estimated',
        provenance: {
          confidence: 'medium',
          matches: [{ foodCode, grams, matchConfidence: 'medium' }],
        },
      });
    }
  });

  it('records conservative default measures only after matching the food', () => {
    expect(
      estimateRecipeNutrition([ingredient(1, 'packet', 'mozzarella')], 1),
    ).toMatchObject({
      kind: 'estimated',
      provenance: {
        confidence: 'medium',
        matches: [
          {
            grams: 125,
            matchConfidence: 'medium',
            quantitySource: 'household_measure',
          },
        ],
      },
    });
    expect(
      estimateRecipeNutrition([ingredient(1, 'item', 'mystery food')], 1),
    ).toEqual({
      issues: [
        {
          ingredientIndex: 0,
          ingredientName: 'mystery food',
          reason: 'no_match',
        },
      ],
      kind: 'incomplete',
    });
  });

  it('uses exact CoFID names with high confidence and converts imperial mass', () => {
    const result = estimateRecipeNutrition(
      [
        {
          name: 'Onions, raw',
          preparationNote: '',
          quantity: 1,
          unit: 'lb',
        },
      ],
      1,
    );

    expect(result).toMatchObject({
      kind: 'estimated',
      provenance: {
        confidence: 'high',
        matches: [
          {
            foodCode: '13-499',
            grams: 453.592,
            matchConfidence: 'high',
            quantitySource: 'avoirdupois',
          },
        ],
      },
    });
  });

  it('estimates the reported everyday recipe and records its assumptions', () => {
    const result = estimateRecipeNutrition(
      [
        ingredient(1, 'unit', 'baking potatoes'),
        ingredient(100, 'g', 'chicken breast'),
        ingredient(1, 'tbsp', 'butter'),
        ingredient(0.5, 'tsp', 'extra virgin olive oil'),
        ingredient(30, 'g', 'grated cheddar cheese'),
        ingredient(415, 'g', 'Heinz baked beans'),
      ],
      1,
    );

    expect(result).toMatchObject({
      kind: 'estimated',
      nutrition: {
        carbsGrams: 111.37,
        fatGrams: 28,
        kcal: 899.54,
        proteinGrams: 57.21,
      },
      provenance: {
        confidence: 'medium',
        matches: [
          {
            grams: 250,
            ingredientIndex: 0,
            quantitySource: 'household_measure',
          },
          { ingredientIndex: 1, quantitySource: 'metric' },
          {
            grams: 14.4,
            ingredientIndex: 2,
            quantitySource: 'household_measure',
          },
          {
            grams: 2.275,
            ingredientIndex: 3,
            quantitySource: 'household_measure',
          },
          { ingredientIndex: 4, quantitySource: 'metric' },
          { ingredientIndex: 5, quantitySource: 'metric' },
        ],
      },
    });
  });

  it('covers common Paprika measures and flags omitted seasonings', () => {
    const result = estimateRecipeNutrition(
      [
        ingredient(1, 'tbsp', 'coconut oil'),
        ingredient(2, 'clove', 'garlic'),
        ingredient(200, 'ml', 'chicken stock'),
        ingredient(1, 'tbsp', 'smoked paprika'),
        ingredient(1, 'tsp', 'ground cinnamon'),
      ],
      2,
    );

    expect(result).toMatchObject({
      kind: 'estimated',
      provenance: {
        confidence: 'medium',
        matches: [
          { grams: 13.8, quantitySource: 'household_measure' },
          { grams: 6, quantitySource: 'household_measure' },
          { grams: 200, quantitySource: 'label_measure' },
        ],
        omissions: [
          {
            ingredientName: 'smoked paprika',
            reason: 'negligible_seasoning',
          },
          {
            ingredientName: 'ground cinnamon',
            reason: 'negligible_seasoning',
          },
        ],
      },
    });
  });

  it('does not omit a dried seasoning above the 10g boundary', () => {
    const result = estimateRecipeNutrition(
      [ingredient(25, 'g', 'smoked paprika')],
      1,
    );

    expect(result).toMatchObject({
      kind: 'estimated',
      provenance: {
        confidence: 'medium',
        matches: [{ foodCode: 'reference-smoked-paprika', grams: 25 }],
      },
    });
    if (result.kind !== 'estimated') throw new Error('Expected an estimate.');
    expect(result.provenance.omissions).toBeUndefined();
  });

  it('keeps measure conversions for exact CoFID food names', () => {
    const result = estimateRecipeNutrition(
      [ingredient(2, 'tbsp', 'honey'), ingredient(2, 'tsp', 'sesame seeds')],
      1,
    );

    expect(result).toMatchObject({
      kind: 'estimated',
      provenance: {
        matches: [
          { grams: 42, quantitySource: 'household_measure' },
          { grams: 6, quantitySource: 'household_measure' },
        ],
      },
    });
  });

  it('defaults egg noodles to fresh and keeps dried noodles distinct', () => {
    const fresh = estimateRecipeNutrition(
      [ingredient(300, 'g', 'fresh egg noodles')],
      1,
    );
    const unspecified = estimateRecipeNutrition(
      [ingredient(300, 'g', 'egg noodles')],
      1,
    );
    const dried = estimateRecipeNutrition(
      [ingredient(300, 'g', 'dried egg noodles')],
      1,
    );

    if (fresh.kind !== 'estimated' || unspecified.kind !== 'estimated') {
      throw new Error('Expected fresh noodle estimates.');
    }

    expect(fresh).toMatchObject({
      kind: 'estimated',
      nutrition: {
        carbsGrams: 82.5,
        fatGrams: 2.4,
        kcal: 387,
        proteinGrams: 14.1,
      },
      provenance: { matches: [{ foodCode: '11-941' }] },
    });
    expect(unspecified).toMatchObject({
      kind: 'estimated',
      provenance: { matches: [{ foodCode: '11-941' }] },
    });
    expect(unspecified.nutrition).toEqual(fresh.nutrition);
    expect(dried).toMatchObject({
      kind: 'estimated',
      nutrition: {
        carbsGrams: 217.8,
        fatGrams: 6,
        kcal: 1014,
        proteinGrams: 36,
      },
      provenance: { matches: [{ foodCode: '11-719' }] },
    });
  });

  it('does not collapse compound foods into a shorter alias', () => {
    for (const name of ['avocado oil', 'banana bread']) {
      expect(estimateRecipeNutrition([ingredient(300, 'g', name)], 1)).toEqual({
        issues: [
          {
            ingredientIndex: 0,
            ingredientName: name,
            reason: 'no_match',
          },
        ],
        kind: 'incomplete',
      });
    }
  });

  it('estimates the reviewed BBC lemon chicken ingredients', () => {
    const result = estimateRecipeNutrition(
      [
        ingredient(600, 'g', 'chicken breast fillets cut into 2cm pieces'),
        ingredient(2, 'tbsp', 'cornflour'),
        ingredient(5, 'tbsp', 'plain flour'),
        ingredient(1, 'tsp', 'baking powder'),
        ingredient(1, 'item', 'egg beaten'),
        ingredient(2, 'tbsp', 'sunflower or vegetable oil for frying'),
        ingredient(2, 'item', 'spring onions finely sliced'),
        ingredient(2, 'tsp', 'cornflour'),
        ingredient(2, 'item', 'unwaxed lemons zested and juiced'),
        ingredient(2, 'tbsp', 'honey'),
        ingredient(2, 'tbsp', 'soy sauce'),
        ingredient(2, 'tsp', 'sesame seeds'),
        ingredient(2, 'tsp', 'sesame oil'),
      ],
      6,
    );

    expect(result.kind).toBe('estimated');
    if (result.kind !== 'estimated') return;
    expect(result.provenance.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ foodCode: '18-290', ingredientIndex: 0 }),
        expect.objectContaining({ foodCode: '12-937', ingredientIndex: 4 }),
        expect.objectContaining({ foodCode: '17-686', ingredientIndex: 5 }),
        expect.objectContaining({ foodCode: '13-352', ingredientIndex: 6 }),
        expect.objectContaining({ foodCode: '14-130', ingredientIndex: 8 }),
        expect.objectContaining({ grams: 42, ingredientIndex: 9 }),
        expect.objectContaining({ grams: 6, ingredientIndex: 11 }),
      ]),
    );
    expect(result.provenance.omissions).toEqual([
      expect.objectContaining({
        ingredientIndex: 3,
        reason: 'negligible_seasoning',
      }),
    ]);
  });

  it('does not guess unknown foods or unsupported measures', () => {
    expect(
      estimateRecipeNutrition(
        [
          {
            name: 'whole milk',
            preparationNote: '',
            quantity: 1,
            unit: 'scoop',
          },
          {
            name: 'mystery powder',
            preparationNote: '',
            quantity: 10,
            unit: 'g',
          },
        ],
        1,
      ),
    ).toEqual({
      issues: [
        {
          ingredientIndex: 0,
          ingredientName: 'whole milk',
          reason: 'unsupported_unit',
        },
        {
          ingredientIndex: 1,
          ingredientName: 'mystery powder',
          reason: 'no_match',
        },
      ],
      kind: 'incomplete',
    });
  });
});

function ingredient(quantity: number, unit: string, name: string) {
  return { name, preparationNote: '', quantity, unit };
}
