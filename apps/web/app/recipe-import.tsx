'use client';

import type {
  RecipeImportPreview,
  RecipeImportResponse,
  RecipeInput,
} from '@macromap/contracts';
import { parseSchemaOrgRecipe } from '@macromap/domain/schema-org-recipe';
import { useState, type FormEvent } from 'react';
import { previewRecipeImport, type RecipeApiConfig } from './recipe-api';
import { RecipeForm } from './recipe-form';

export function RecipeImportView({
  api,
  onCancel,
  onSave,
}: {
  readonly api: RecipeApiConfig | undefined;
  readonly onCancel: () => void;
  readonly onSave: (importId: string, recipe: RecipeInput) => Promise<void>;
}) {
  const [content, setContent] = useState('');
  const [result, setResult] = useState<RecipeImportResponse>();
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function review(recipeIndex?: number): Promise<void> {
    setLoading(true);
    setMessage(undefined);
    try {
      setResult(
        api === undefined
          ? localPreview(content, recipeIndex)
          : await previewRecipeImport(api, content, recipeIndex),
      );
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setLoading(false);
    }
  }

  if (result?.kind === 'preview') {
    return (
      <RecipeForm
        eyebrow="Recipe import"
        heading="Review imported recipe"
        initial={result.draft}
        notices={result.warnings.map(({ message }) => message)}
        onCancel={onCancel}
        onSave={(recipe) => onSave(result.importId, recipe)}
        submitLabel="Save imported recipe"
      />
    );
  }

  return (
    <section className="recipe-form" aria-labelledby="recipe-import-title">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Recipe import</p>
          <h1 id="recipe-import-title">Import recipe JSON</h1>
          <p>
            Paste Schema.org Recipe JSON or JSON-LD to create a review draft.
          </p>
        </div>
        <button className="text-button" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>

      {result?.kind === 'selection' ? (
        <section className="form-section">
          <h2>Choose a recipe</h2>
          <p className="section-help">
            This document contains more than one recipe. Nothing has been
            imported yet.
          </p>
          <div className="import-candidates">
            {result.candidates.map((candidate) => (
              <button
                className="secondary-button"
                disabled={loading}
                key={candidate.index}
                onClick={() => void review(candidate.index)}
                type="button"
              >
                {candidate.title}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <form
          className="form-section"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void review();
          }}
        >
          <label className="form-field">
            <span>Schema.org Recipe JSON</span>
            <textarea
              onChange={(event) => setContent(event.target.value)}
              placeholder='{"@context":"https://schema.org","@type":"Recipe",…}'
              rows={16}
              value={content}
            />
          </label>
          <button
            className="primary-button"
            disabled={loading || content.trim() === ''}
            type="submit"
          >
            {loading ? 'Reading recipe…' : 'Review recipe'}
          </button>
        </form>
      )}

      {message === undefined ? null : (
        <p className="notice" role="alert">
          {message}
        </p>
      )}
    </section>
  );
}

function localPreview(
  content: string,
  recipeIndex?: number,
): RecipeImportResponse {
  const parsed = parseSchemaOrgRecipe(content, recipeIndex);
  if (parsed.kind === 'error') throw new Error(parsed.message);
  if (parsed.kind === 'selection') {
    return { candidates: [...parsed.candidates], kind: 'selection' };
  }
  return {
    ...parsed,
    importId: crypto.randomUUID(),
    warnings: [...parsed.warnings],
  } satisfies RecipeImportPreview;
}

function messageFrom(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'MacroMap could not read that recipe.';
}
