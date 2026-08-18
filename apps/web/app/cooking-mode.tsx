'use client';

import type { Recipe } from '@macromap/contracts';
import { useEffect, useState } from 'react';
import { RecipePhoto } from './recipe-photo';

interface CookingModeProps {
  readonly onExit: () => void;
  readonly recipe: Recipe;
}

export function CookingMode({ onExit, recipe }: CookingModeProps) {
  const [servings, setServings] = useState(String(recipe.servingCount));
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(
    new Set(),
  );
  const [step, setStep] = useState(0);
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | 'unsupported'>();

  useEffect(
    () => () => {
      if (typeof wakeLock === 'object') void wakeLock.release();
    },
    [wakeLock],
  );

  const selectedServings = Number(servings);
  const scale =
    Number.isFinite(selectedServings) && selectedServings > 0
      ? selectedServings / recipe.servingCount
      : 1;
  const instruction = recipe.instructions[step];

  async function keepScreenAwake(): Promise<void> {
    if (!('wakeLock' in navigator)) {
      setWakeLock('unsupported');
      return;
    }
    try {
      setWakeLock(await navigator.wakeLock.request('screen'));
    } catch {
      setWakeLock(undefined);
    }
  }

  return (
    <section className="cooking-view">
      <header className="cooking-header">
        <div>
          <p className="eyebrow">Cooking mode</p>
          <h1>{recipe.title}</h1>
        </div>
        <button className="text-button" onClick={onExit}>
          Exit cooking mode
        </button>
      </header>

      <RecipePhoto
        alt={recipe.title}
        className="cooking-photo"
        photoUrl={recipe.photoUrl}
        placeholderText="No photo for this recipe"
      />

      <div className="cooking-controls">
        <label className="form-field">
          <span>Cook this many servings</span>
          <input
            min="0.25"
            onChange={(event) => setServings(event.target.value)}
            step="0.25"
            type="number"
            value={servings}
          />
        </label>
        <button
          className="secondary-button compact-button"
          disabled={typeof wakeLock === 'object'}
          onClick={keepScreenAwake}
        >
          {typeof wakeLock !== 'object'
            ? 'Keep screen awake'
            : 'Screen will stay awake'}
        </button>
      </div>
      {wakeLock === 'unsupported' ? (
        <p className="section-help">
          Screen wake lock is not supported by this browser.
        </p>
      ) : null}

      <section className="cooking-card">
        <p className="card-label">Ingredients</p>
        <h2>Everything you need</h2>
        <ul className="cooking-ingredients">
          {recipe.ingredients.map((ingredient, index) => (
            <li key={`${ingredient.name}-${index}`}>
              <label>
                <input
                  checked={checkedIngredients.has(index)}
                  onChange={() =>
                    setCheckedIngredients((current) => {
                      const next = new Set(current);
                      if (next.has(index)) next.delete(index);
                      else next.add(index);
                      return next;
                    })
                  }
                  type="checkbox"
                />
                <span>
                  <strong>
                    {formatAmount(ingredient.quantity * scale)}{' '}
                    {ingredient.unit}
                  </strong>{' '}
                  {ingredient.name}
                  {ingredient.preparationNote === ''
                    ? ''
                    : `, ${ingredient.preparationNote}`}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      {recipe.instructions.length === 0 ? (
        <section className="cooking-card cooking-step">
          <p className="card-label">Method</p>
          <p>No instructions added yet.</p>
        </section>
      ) : (
        <section className="cooking-card cooking-step" aria-live="polite">
          <p className="card-label">
            Step {step + 1} of {recipe.instructions.length}
          </p>
          <p>{instruction}</p>
          <div className="step-actions">
            <button
              className="secondary-button compact-button"
              disabled={step === 0}
              onClick={() => setStep((current) => current - 1)}
            >
              Previous
            </button>
            <button
              className="primary-button compact-button"
              disabled={step === recipe.instructions.length - 1}
              onClick={() => setStep((current) => current + 1)}
            >
              Next step
            </button>
          </div>
        </section>
      )}
    </section>
  );
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    maximumFractionDigits: 3,
  }).format(value);
}
