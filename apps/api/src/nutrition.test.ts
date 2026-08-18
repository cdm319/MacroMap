import type { RecipeImportDraft, RecipeInput } from '@macromap/contracts';
import { describe, expect, it } from 'vitest';
import { prepareRecipeNutrition } from './nutrition.js';

const recipe: RecipeInput = {
  description: '',
  ingredients: [
    { name: 'pasta', preparationNote: '', quantity: 200, unit: 'g' },
  ],
  instructions: [],
  mealTypes: ['dinner'],
  nutrition: null,
  servingCount: 2,
  source: null,
  tags: { cuisines: [], flavours: [], proteins: [] },
  title: 'Pasta',
};

describe('recipe nutrition preparation', () => {
  it('estimates missing nutrition from reviewed ingredients', () => {
    expect(prepareRecipeNutrition(recipe)).toMatchObject({
      nutritionProvenance: { source: 'cofid' },
      recipe: {
        nutrition: {
          carbsGrams: 75.6,
          fatGrams: 1.6,
          kcal: 343,
          proteinGrams: 11.3,
        },
      },
    });
  });

  it('treats user-supplied nutrition as authoritative', () => {
    const nutrition = {
      carbsGrams: 80,
      fatGrams: 2,
      kcal: 360,
      proteinGrams: 12,
    };

    expect(prepareRecipeNutrition({ ...recipe, nutrition })).toMatchObject({
      nutritionProvenance: { confidence: 'confirmed', source: 'manual' },
      recipe: { nutrition },
    });
  });

  it('retains unchanged reviewed Schema.org nutrition provenance', () => {
    const nutrition = {
      carbsGrams: 80,
      fatGrams: 2,
      kcal: 360,
      proteinGrams: 12,
    };
    const imported: RecipeImportDraft = {
      ...recipe,
      nutrition,
      nutritionProvenance: {
        confidence: 'confirmed',
        source: 'schema_org',
      },
      photoStaged: false,
      photoUrl: null,
    };

    expect(
      prepareRecipeNutrition({ ...recipe, nutrition }, imported),
    ).toMatchObject({
      nutritionProvenance: {
        confidence: 'confirmed',
        source: 'schema_org',
      },
    });
  });
});
