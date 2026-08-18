'use client';

import type {
  RecipeImportPreview,
  RecipeImportResponse,
  RecipeInput,
} from '@macromap/contracts';
import { parseSchemaOrgRecipe } from '@macromap/domain/schema-org-recipe';
import { useState, type FormEvent } from 'react';
import {
  previewRecipeImport,
  previewRecipeUrl,
  type RecipeApiConfig,
} from './recipe-api';
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
  const [method, setMethod] = useState<'json' | 'url'>(
    api === undefined ? 'json' : 'url',
  );
  const [result, setResult] = useState<RecipeImportResponse>();
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(false);

  function chooseMethod(next: 'json' | 'url'): void {
    setMethod(next);
    setResult(undefined);
    setMessage(undefined);
  }

  async function review(recipeIndex?: number): Promise<void> {
    setLoading(true);
    setMessage(undefined);
    try {
      if (method === 'url') {
        if (api === undefined) throw new Error('Sign in to import from a URL.');
        setResult(await previewRecipeUrl(api, url, recipeIndex));
      } else {
        setResult(
          api === undefined
            ? localPreview(content, recipeIndex)
            : await previewRecipeImport(api, content, recipeIndex),
        );
      }
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setLoading(false);
    }
  }

  if (result?.kind === 'preview') {
    const photoUrl = result.draft.photoStaged ? result.draft.photoUrl : null;
    return (
      <RecipeForm
        eyebrow="Recipe import"
        heading="Review imported recipe"
        initial={result.draft}
        notices={result.warnings.map(({ message }) => message)}
        onCancel={onCancel}
        onSave={(recipe) => onSave(result.importId, recipe)}
        {...(photoUrl === null ? {} : { photoUrl })}
        submitLabel="Save imported recipe"
      />
    );
  }

  return (
    <section className="recipe-form" aria-labelledby="recipe-import-title">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Recipe import</p>
          <h1 id="recipe-import-title">Import a recipe</h1>
          <p>Start with a recipe webpage or paste Schema.org JSON.</p>
        </div>
        <button className="text-button" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>

      <div className="import-methods" aria-label="Import method">
        <button
          aria-pressed={method === 'url'}
          className="secondary-button"
          disabled={api === undefined}
          onClick={() => chooseMethod('url')}
          type="button"
        >
          From URL
        </button>
        <button
          aria-pressed={method === 'json'}
          className="secondary-button"
          onClick={() => chooseMethod('json')}
          type="button"
        >
          Paste JSON
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
      ) : method === 'url' ? (
        <form
          className="form-section"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void review();
          }}
        >
          <label className="form-field">
            <span>Recipe URL</span>
            <input
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/recipe"
              required
              type="url"
              value={url}
            />
          </label>
          <button
            className="primary-button"
            disabled={loading || url.trim() === ''}
            type="submit"
          >
            {loading ? 'Reading recipe…' : 'Review recipe'}
          </button>
        </form>
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
