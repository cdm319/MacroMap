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

  it('uses reviewable close matches for ordinary UK ingredient wording', () => {
    const foods = [
      ['chicken sausages', 1, 'item', '19-658', 60],
      ['wholemeal penne', 100, 'g', '11-718', 100],
      ['cornflour mixed with water', 1, 'tbsp', '11-1045', 8.25],
      ['Worcester sauce', 1, 'tbsp', '17-723', 16.5],
      ['sriracha', 1, 'tbsp', '17-719', 16.5],
      ['coconut flour', 100, 'g', '14-873', 100],
      ['white fish', 100, 'g', '16-372', 100],
      ['couscous', 100, 'g', '11-901', 100],
    ] as const;

    for (const [name, quantity, unit, foodCode, grams] of foods) {
      const result = estimateRecipeNutrition(
        [ingredient(quantity, unit, name)],
        1,
      );
      expect(result).toMatchObject({
        kind: 'estimated',
        provenance: {
          confidence: 'low',
          matches: [{ foodCode, grams, matchConfidence: 'low' }],
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
        confidence: 'low',
        matches: [
          {
            grams: 250,
            matchConfidence: 'low',
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
        confidence: 'low',
        matches: [
          {
            grams: 250,
            ingredientIndex: 0,
            quantitySource: 'estimated_count',
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
        ingredient(1, 'tsp', 'smoked paprika'),
        ingredient(1, 'tsp', 'ground cinnamon'),
      ],
      2,
    );

    expect(result).toMatchObject({
      kind: 'estimated',
      provenance: {
        confidence: 'low',
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
