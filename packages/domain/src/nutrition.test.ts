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

  it('does not guess unsupported volumes or unknown foods', () => {
    expect(
      estimateRecipeNutrition(
        [
          {
            name: 'whole milk',
            preparationNote: '',
            quantity: 250,
            unit: 'ml',
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
