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
