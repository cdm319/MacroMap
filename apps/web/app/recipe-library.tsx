'use client';

import type { Recipe, RecipeInput, RecipeSummary } from '@macromap/contracts';
import { useEffect, useState } from 'react';
import { CookingMode } from './cooking-mode';
import {
  archiveRecipe,
  getRecipe,
  listRecipes,
  saveRecipe,
  type RecipeApiConfig,
} from './recipe-api';
import { RecipeForm } from './recipe-form';

interface RecipeLibraryProps {
  readonly api: RecipeApiConfig | undefined;
}

type LibraryView =
  | { readonly kind: 'list' }
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
    if (api === undefined) {
      setLocalRecipes((current) => [
        saved,
        ...current.filter(({ id }) => id !== recipeId),
      ]);
    } else {
      setRecipes((current) => [
        summaryFrom(saved),
        ...current.filter(({ id }) => id !== recipeId),
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

  if (view.kind === 'new') {
    return (
      <RecipeForm
        onCancel={() => setView({ kind: 'list' })}
        onSave={(input) => persistRecipe(crypto.randomUUID(), input)}
      />
    );
  }
  if (view.kind === 'edit') {
    return (
      <RecipeForm
        onCancel={() => setView({ kind: 'view', recipe: view.recipe })}
        onSave={(input) => persistRecipe(view.recipe.id, input)}
        recipe={view.recipe}
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
        <button
          className="primary-button"
          onClick={() => setView({ kind: 'new' })}
        >
          Add recipe
        </button>
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
              <div className="recipe-card-photo" aria-hidden="true">
                M
              </div>
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
  recipe,
}: {
  readonly onArchive: () => void;
  readonly onBack: () => void;
  readonly onCook: () => void;
  readonly onEdit: () => void;
  readonly recipe: Recipe;
}) {
  const tags = [
    ...recipe.mealTypes.map(capitalize),
    ...recipe.tags.cuisines,
    ...recipe.tags.proteins,
    ...recipe.tags.flavours,
  ];
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
                This recipe will stay out of meal plans until nutrition is
                added.
              </p>
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
        </section>
      </div>

      <section className="detail-card instructions-card">
        <p className="card-label">Method</p>
        <ol>
          {recipe.instructions.map((instruction, index) => (
            <li key={index}>{instruction}</li>
          ))}
        </ol>
      </section>
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

function localRecipe(id: string, input: RecipeInput): Recipe {
  return {
    ...input,
    id,
    planningStatus: input.nutrition === null ? 'needs-nutrition' : 'ready',
    updatedAt: new Date().toISOString(),
  };
}

function summaryFrom(recipe: Recipe): RecipeSummary {
  const {
    id,
    mealTypes,
    nutrition,
    planningStatus,
    servingCount,
    title,
    updatedAt,
  } = recipe;
  return {
    id,
    mealTypes,
    nutrition,
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
