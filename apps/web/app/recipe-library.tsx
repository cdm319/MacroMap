'use client';

import type {
  Recipe,
  RecipeInput,
  RecipeNutritionProvenance,
  RecipeSummary,
} from '@macromap/contracts';
import {
  describeNutritionEstimationIssue,
  estimateRecipeNutrition,
} from '@macromap/domain/nutrition';
import { useEffect, useState } from 'react';
import { CookingMode } from './cooking-mode';
import {
  archiveRecipe,
  deleteRecipePhoto,
  getRecipe,
  listRecipes,
  saveRecipeImport,
  saveRecipe,
  uploadRecipePhoto,
  validateRecipePhoto,
  type RecipeApiConfig,
} from './recipe-api';
import { RecipeForm } from './recipe-form';
import { RecipeImportView } from './recipe-import';
import { RecipePhoto } from './recipe-photo';

interface RecipeLibraryProps {
  readonly api: RecipeApiConfig | undefined;
}

type LibraryView =
  | { readonly kind: 'list' }
  | { readonly kind: 'import' }
  | { readonly kind: 'new' }
  | { readonly kind: 'view'; readonly recipe: Recipe }
  | { readonly kind: 'edit'; readonly recipe: Recipe }
  | { readonly kind: 'cook'; readonly recipe: Recipe };

export function RecipeLibrary({ api }: RecipeLibraryProps) {
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [localRecipes, setLocalRecipes] = useState<Recipe[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [view, setView] = useState<LibraryView>({ kind: 'list' });
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(api !== undefined);

  useEffect(() => {
    if (api === undefined) return;
    let active = true;
    void listRecipes(api)
      .then((page) => {
        if (!active) return;
        setRecipes(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((error: unknown) => {
        if (active) setMessage(messageFrom(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);

  const visibleRecipes = api === undefined ? localRecipes : recipes;

  async function loadMore(): Promise<void> {
    if (api === undefined || nextCursor === null) return;
    setLoading(true);
    setMessage(undefined);
    try {
      const page = await listRecipes(api, nextCursor);
      setRecipes((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setLoading(false);
    }
  }

  async function openRecipe(summary: RecipeSummary): Promise<void> {
    setMessage(undefined);
    try {
      const recipe =
        api === undefined
          ? localRecipes.find(({ id }) => id === summary.id)
          : await getRecipe(api, summary.id);
      if (recipe === undefined) throw new Error('Recipe not found.');
      setView({ kind: 'view', recipe });
    } catch (error) {
      setMessage(messageFrom(error));
    }
  }

  async function persistRecipe(
    recipeId: string,
    input: RecipeInput,
  ): Promise<void> {
    const saved =
      api === undefined
        ? localRecipe(recipeId, input)
        : await saveRecipe(api, recipeId, input);
    showSaved(saved);
  }

  async function persistImportedRecipe(
    importId: string,
    input: RecipeInput,
  ): Promise<void> {
    const saved =
      api === undefined
        ? localRecipe(importId, input)
        : await saveRecipeImport(api, importId, input);
    showSaved(saved);
  }

  function showSaved(saved: Recipe): void {
    if (api === undefined) {
      setLocalRecipes((current) => [
        saved,
        ...current.filter(({ id }) => id !== saved.id),
      ]);
    } else {
      setRecipes((current) => [
        summaryFrom(saved),
        ...current.filter(({ id }) => id !== saved.id),
      ]);
    }
    setView({ kind: 'view', recipe: saved });
  }

  async function archive(current: Recipe): Promise<void> {
    if (!window.confirm(`Archive “${current.title}”?`)) return;
    try {
      if (api !== undefined) await archiveRecipe(api, current.id);
      setRecipes((items) => items.filter(({ id }) => id !== current.id));
      setLocalRecipes((items) => items.filter(({ id }) => id !== current.id));
      setView({ kind: 'list' });
    } catch (error) {
      setMessage(messageFrom(error));
    }
  }

  function showUpdatedRecipe(recipe: Recipe): void {
    setLocalRecipes((current) => [
      recipe,
      ...current.filter(({ id }) => id !== recipe.id),
    ]);
    setRecipes((current) => [
      summaryFrom(recipe),
      ...current.filter(({ id }) => id !== recipe.id),
    ]);
    setView({ kind: 'view', recipe });
  }

  async function uploadPhoto(recipe: Recipe, file: File): Promise<void> {
    validateRecipePhoto(file);
    const photoUrl =
      api === undefined
        ? URL.createObjectURL(file)
        : await uploadRecipePhoto(api, recipe.id, file);
    if (api === undefined && recipe.photoUrl?.startsWith('blob:') === true) {
      URL.revokeObjectURL(recipe.photoUrl);
    }
    showUpdatedRecipe({ ...recipe, photoUrl });
  }

  async function removePhoto(recipe: Recipe): Promise<void> {
    if (api === undefined) {
      if (recipe.photoUrl?.startsWith('blob:') === true) {
        URL.revokeObjectURL(recipe.photoUrl);
      }
    } else {
      await deleteRecipePhoto(api, recipe.id);
    }
    showUpdatedRecipe({ ...recipe, photoUrl: null });
  }

  if (view.kind === 'new') {
    return (
      <RecipeForm
        onCancel={() => setView({ kind: 'list' })}
        onSave={(input) => persistRecipe(crypto.randomUUID(), input)}
      />
    );
  }
  if (view.kind === 'import') {
    return (
      <RecipeImportView
        api={api}
        onCancel={() => setView({ kind: 'list' })}
        onSave={persistImportedRecipe}
      />
    );
  }
  if (view.kind === 'edit') {
    return (
      <RecipeForm
        onCancel={() => setView({ kind: 'view', recipe: view.recipe })}
        initial={view.recipe}
        onSave={(input) => persistRecipe(view.recipe.id, input)}
      />
    );
  }
  if (view.kind === 'cook') {
    return (
      <CookingMode
        onExit={() => setView({ kind: 'view', recipe: view.recipe })}
        recipe={view.recipe}
      />
    );
  }
  if (view.kind === 'view') {
    return (
      <RecipeDetail
        onArchive={() => archive(view.recipe)}
        onBack={() => setView({ kind: 'list' })}
        onCook={() => setView({ kind: 'cook', recipe: view.recipe })}
        onEdit={() => setView({ kind: 'edit', recipe: view.recipe })}
        onPhotoRemove={() => removePhoto(view.recipe)}
        onPhotoUpload={(file) => uploadPhoto(view.recipe, file)}
        recipe={view.recipe}
      />
    );
  }

  return (
    <section className="recipe-page" aria-labelledby="recipe-library-title">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Your collection</p>
          <h1 id="recipe-library-title">Recipe library</h1>
          <p>Store the meals MacroMap can use when it plans your week.</p>
        </div>
        <div className="library-actions">
          <button
            className="secondary-button"
            onClick={() => setView({ kind: 'import' })}
          >
            Import recipe
          </button>
          <button
            className="primary-button"
            onClick={() => setView({ kind: 'new' })}
          >
            Add recipe
          </button>
        </div>
      </div>

      {message === undefined ? null : (
        <p className="notice" role="alert">
          {message}
        </p>
      )}
      {loading && visibleRecipes.length === 0 ? (
        <p className="empty-state">Loading recipes…</p>
      ) : visibleRecipes.length === 0 ? (
        <div className="empty-state">
          <h2>Your recipe book is empty</h2>
          <p>Add the first meal you would be happy to see in a weekly plan.</p>
        </div>
      ) : (
        <div className="recipe-grid">
          {visibleRecipes.map((recipe) => (
            <button
              className="recipe-card"
              key={recipe.id}
              onClick={() => openRecipe(recipe)}
            >
              <RecipePhoto
                alt=""
                className="recipe-card-photo"
                photoUrl={recipe.photoUrl}
              />
              <div>
                <p className="recipe-tags">
                  {recipe.mealTypes.map(capitalize).join(' · ')}
                </p>
                <h2>{recipe.title}</h2>
                <p>{formatServings(recipe.servingCount)}</p>
                <span
                  className={`status-pill status-pill--${recipe.planningStatus}`}
                >
                  {recipe.planningStatus === 'ready'
                    ? 'Ready for planning'
                    : 'Nutrition needed'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
      {api !== undefined && nextCursor !== null ? (
        <button
          className="secondary-button load-more"
          disabled={loading}
          onClick={loadMore}
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </section>
  );
}

function RecipeDetail({
  onArchive,
  onBack,
  onCook,
  onEdit,
  onPhotoRemove,
  onPhotoUpload,
  recipe,
}: {
  readonly onArchive: () => void;
  readonly onBack: () => void;
  readonly onCook: () => void;
  readonly onEdit: () => void;
  readonly onPhotoRemove: () => Promise<void>;
  readonly onPhotoUpload: (file: File) => Promise<void>;
  readonly recipe: Recipe;
}) {
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<string>();
  const missingNutrition =
    recipe.nutrition === null
      ? estimateRecipeNutrition(recipe.ingredients, recipe.servingCount)
      : null;
  const tags = [
    ...recipe.mealTypes.map(capitalize),
    ...recipe.tags.cuisines,
    ...recipe.tags.proteins,
    ...recipe.tags.flavours,
  ];

  async function choosePhoto(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    setPhotoBusy(true);
    setPhotoMessage(undefined);
    try {
      await onPhotoUpload(file);
    } catch (error) {
      setPhotoMessage(messageFrom(error));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto(): Promise<void> {
    setPhotoBusy(true);
    setPhotoMessage(undefined);
    try {
      await onPhotoRemove();
    } catch (error) {
      setPhotoMessage(messageFrom(error));
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <article className="recipe-detail">
      <button className="text-button back-button" onClick={onBack}>
        ← Recipe library
      </button>
      <div className="view-heading">
        <div>
          <p className="recipe-tags">{tags.join(' · ')}</p>
          <h1>{recipe.title}</h1>
          <p>{recipe.description}</p>
        </div>
        <div className="detail-actions">
          <button className="primary-button" onClick={onCook}>
            Start cooking
          </button>
          <button className="secondary-button" onClick={onEdit}>
            Edit
          </button>
        </div>
      </div>

      <section className="recipe-photo-section">
        <RecipePhoto
          alt={recipe.title}
          className="recipe-detail-photo"
          photoUrl={recipe.photoUrl}
          placeholderText="No photo for this recipe"
        />
        <div className="recipe-photo-actions">
          <label className="secondary-button photo-upload-button">
            <input
              accept="image/jpeg,image/png,image/webp"
              disabled={photoBusy}
              onChange={(event) => {
                void choosePhoto(event.target.files?.[0]);
                event.target.value = '';
              }}
              type="file"
            />
            {photoBusy
              ? 'Uploading…'
              : recipe.photoUrl === null
                ? 'Add photo'
                : 'Replace photo'}
          </label>
          {recipe.photoUrl === null ? null : (
            <button
              className="text-button"
              disabled={photoBusy}
              onClick={() => void removePhoto()}
            >
              Remove photo
            </button>
          )}
        </div>
        {photoMessage === undefined ? null : (
          <p className="notice" role="alert">
            {photoMessage}
          </p>
        )}
      </section>

      <div className="recipe-detail-grid">
        <section className="detail-card">
          <p className="card-label">Ingredients</p>
          <h2>{formatServings(recipe.servingCount)}</h2>
          <ul className="detail-ingredients">
            {recipe.ingredients.map((ingredient, index) => (
              <li key={`${ingredient.name}-${index}`}>
                <strong>
                  {ingredient.quantity} {ingredient.unit}
                </strong>{' '}
                {ingredient.name}
                {ingredient.preparationNote === ''
                  ? ''
                  : `, ${ingredient.preparationNote}`}
              </li>
            ))}
          </ul>
        </section>
        <section className="detail-card">
          <p className="card-label">Per serving</p>
          {recipe.nutrition === null ? (
            <div className="nutrition-missing">
              <h2>Nutrition needed</h2>
              <p>
                {missingNutrition?.kind === 'estimated'
                  ? 'An estimate is now available. Edit and save this recipe to apply it.'
                  : 'This recipe will stay out of meal plans until nutrition is added.'}
              </p>
              {missingNutrition?.kind !== 'incomplete' ? null : (
                <ul>
                  {missingNutrition.issues.map((issue) => (
                    <li
                      key={`${issue.ingredientIndex}-${issue.ingredientName}`}
                    >
                      {describeNutritionEstimationIssue(issue)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <dl className="nutrition-summary">
              <Macro label="Calories" value={`${recipe.nutrition.kcal} kcal`} />
              <Macro
                label="Protein"
                value={`${recipe.nutrition.proteinGrams} g`}
              />
              <Macro label="Carbs" value={`${recipe.nutrition.carbsGrams} g`} />
              <Macro label="Fat" value={`${recipe.nutrition.fatGrams} g`} />
            </dl>
          )}
          {recipe.nutritionProvenance === null ? null : (
            <NutritionSource recipe={recipe} />
          )}
        </section>
      </div>

      <section className="detail-card instructions-card">
        <p className="card-label">Method</p>
        {recipe.instructions.length === 0 ? (
          <p>No instructions added yet.</p>
        ) : (
          <ol>
            {recipe.instructions.map((instruction, index) => (
              <li key={index}>{instruction}</li>
            ))}
          </ol>
        )}
      </section>
      {recipe.source === null ? null : (
        <p className="recipe-source">
          Source:{' '}
          {recipe.source.url === null ? (
            recipe.source.name
          ) : (
            <a href={recipe.source.url} rel="noreferrer" target="_blank">
              {recipe.source.name || recipe.source.url}
            </a>
          )}
        </p>
      )}
      <button className="danger-button" onClick={onArchive}>
        Archive recipe
      </button>
    </article>
  );
}

function Macro({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function NutritionSource({ recipe }: { readonly recipe: Recipe }) {
  const provenance = recipe.nutritionProvenance;
  if (provenance === null) return null;
  if (provenance.source !== 'cofid') {
    return (
      <p className="nutrition-source">
        {provenance.source === 'manual'
          ? 'Confirmed manually'
          : 'Imported and reviewed'}
      </p>
    );
  }
  return (
    <div className="nutrition-source">
      <p>
        Estimated from CoFID {provenance.datasetVersion} ·{' '}
        {capitalize(provenance.confidence)} confidence
      </p>
      <details>
        <summary>How this was estimated</summary>
        <ul>
          {provenance.matches.map((match) => (
            <li key={match.ingredientIndex}>
              {recipe.ingredients[match.ingredientIndex]?.name ?? 'Ingredient'}
              {' → '}
              {match.cofidName} · {quantityDescription(match)}
            </li>
          ))}
          {provenance.omissions?.map((omission) => (
            <li key={`omission-${omission.ingredientIndex}`}>
              {omission.ingredientName} · omitted as a negligible seasoning
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function localRecipe(id: string, input: RecipeInput): Recipe {
  const estimation =
    input.nutrition === null
      ? estimateRecipeNutrition(input.ingredients, input.servingCount)
      : null;
  const nutrition =
    estimation?.kind === 'estimated' ? estimation.nutrition : input.nutrition;
  return {
    ...input,
    id,
    nutrition,
    nutritionProvenance:
      estimation?.kind === 'estimated'
        ? estimation.provenance
        : nutrition === null
          ? null
          : { confidence: 'confirmed', source: 'manual' },
    photoUrl: null,
    planningStatus: nutrition === null ? 'needs-nutrition' : 'ready',
    updatedAt: new Date().toISOString(),
  };
}

function quantityDescription(
  match: Extract<
    RecipeNutritionProvenance,
    { source: 'cofid' }
  >['matches'][number],
): string {
  const grams = `${Math.round(match.grams * 10) / 10} g`;
  if (match.quantitySource === 'estimated_count') return `${grams} assumed`;
  if (match.quantitySource === 'household_measure') {
    return `${grams} converted`;
  }
  return grams;
}

function summaryFrom(recipe: Recipe): RecipeSummary {
  const {
    id,
    mealTypes,
    nutrition,
    nutritionProvenance,
    photoUrl,
    planningStatus,
    servingCount,
    title,
    updatedAt,
  } = recipe;
  return {
    id,
    mealTypes,
    nutrition,
    nutritionProvenance,
    photoUrl,
    planningStatus,
    servingCount,
    title,
    updatedAt,
  };
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function formatServings(value: number): string {
  return `${value} ${value === 1 ? 'serving' : 'servings'}`;
}

function messageFrom(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'MacroMap encountered a problem.';
}
