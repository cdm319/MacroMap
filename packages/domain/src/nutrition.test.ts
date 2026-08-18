import { describe, expect, it } from 'vitest';
import { estimateRecipeNutrition } from './nutrition.js';

describe('CoFID nutrition estimation', () => {
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
        datasetVersion: '2021',
        matches: [
          { cofidCode: '11-716', grams: 200, matchConfidence: 'medium' },
          { cofidCode: '13-517', grams: 400, matchConfidence: 'medium' },
        ],
        source: 'cofid',
      },
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
            cofidCode: '13-499',
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
          { grams: 200, quantitySource: 'household_measure' },
        ],
        omissions: [
          {
            ingredientName: 'smoked paprika',
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

  it('distinguishes fresh and dried egg noodles from eggs', () => {
    const fresh = estimateRecipeNutrition(
      [ingredient(300, 'g', 'fresh egg noodles')],
      1,
    );
    const dried = estimateRecipeNutrition(
      [ingredient(300, 'g', 'dried egg noodles')],
      1,
    );

    expect(fresh).toMatchObject({
      kind: 'estimated',
      nutrition: {
        carbsGrams: 82.5,
        fatGrams: 2.4,
        kcal: 387,
        proteinGrams: 14.1,
      },
      provenance: { matches: [{ cofidCode: '11-941' }] },
    });
    expect(dried).toMatchObject({
      kind: 'estimated',
      nutrition: {
        carbsGrams: 217.8,
        fatGrams: 6,
        kcal: 1014,
        proteinGrams: 36,
      },
      provenance: { matches: [{ cofidCode: '11-719' }] },
    });
  });

  it('does not collapse compound foods into a shorter alias', () => {
    for (const name of ['egg noodles', 'avocado oil', 'banana bread']) {
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
        expect.objectContaining({ cofidCode: '18-290', ingredientIndex: 0 }),
        expect.objectContaining({ cofidCode: '12-937', ingredientIndex: 4 }),
        expect.objectContaining({ cofidCode: '17-686', ingredientIndex: 5 }),
        expect.objectContaining({ cofidCode: '13-352', ingredientIndex: 6 }),
        expect.objectContaining({ cofidCode: '14-130', ingredientIndex: 8 }),
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
