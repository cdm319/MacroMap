import type {
  RecipeImportDraft,
  RecipeInput,
  RecipeNutrition,
  RecipeNutritionProvenance,
} from '@macromap/contracts';
import { estimateRecipeNutrition } from '@macromap/domain/nutrition';

export interface PreparedRecipe {
  readonly nutritionProvenance: RecipeNutritionProvenance | null;
  readonly recipe: RecipeInput;
}

export function prepareRecipeNutrition(
  recipe: RecipeInput,
  imported?: RecipeImportDraft,
): PreparedRecipe {
  if (recipe.nutrition !== null) {
    const keepsImportedNutrition =
      imported?.nutritionProvenance?.source === 'schema_org' &&
      nutritionEquals(recipe.nutrition, imported.nutrition);
    return {
      nutritionProvenance: keepsImportedNutrition
        ? imported.nutritionProvenance
        : { confidence: 'confirmed', source: 'manual' },
      recipe,
    };
  }

  const estimation = estimateRecipeNutrition(
    recipe.ingredients,
    recipe.servingCount,
  );
  return estimation.kind === 'estimated'
    ? {
        nutritionProvenance: estimation.provenance,
        recipe: { ...recipe, nutrition: estimation.nutrition },
      }
    : { nutritionProvenance: null, recipe };
}

function nutritionEquals(
  left: RecipeNutrition,
  right: RecipeNutrition | null,
): boolean {
  return (
    right !== null &&
    left.kcal === right.kcal &&
    left.proteinGrams === right.proteinGrams &&
    left.carbsGrams === right.carbsGrams &&
    left.fatGrams === right.fatGrams
  );
}
