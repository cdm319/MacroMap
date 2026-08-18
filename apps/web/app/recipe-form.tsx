'use client';

import {
  recipeInputSchema,
  type MealType,
  type Recipe,
  type RecipeImportDraft,
  type RecipeInput,
} from '@macromap/contracts';
import { useState, type FormEvent } from 'react';
import { RecipePhoto } from './recipe-photo';

interface RecipeFormProps {
  readonly eyebrow?: string;
  readonly heading?: string;
  readonly initial?: Recipe | RecipeImportDraft;
  readonly notices?: ReadonlyArray<string>;
  readonly onCancel: () => void;
  readonly onSave: (recipe: RecipeInput) => Promise<void>;
  readonly photoUrl?: string;
  readonly submitLabel?: string;
}

interface IngredientDraft {
  readonly name: string;
  readonly preparationNote: string;
  readonly quantity: string;
  readonly unit: string;
}

interface NutritionDraft {
  readonly carbsGrams: string;
  readonly fatGrams: string;
  readonly kcal: string;
  readonly proteinGrams: string;
}

const emptyIngredient: IngredientDraft = {
  name: '',
  preparationNote: '',
  quantity: '',
  unit: '',
};

const nutritionFields = [
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
  { key: 'proteinGrams', label: 'Protein', unit: 'g' },
  { key: 'carbsGrams', label: 'Carbs', unit: 'g' },
  { key: 'fatGrams', label: 'Fat', unit: 'g' },
] as const;

const mealTypes: ReadonlyArray<{ label: string; value: MealType }> = [
  { label: 'Breakfast', value: 'breakfast' },
  { label: 'Lunch', value: 'lunch' },
  { label: 'Dinner', value: 'dinner' },
];

export function RecipeForm({
  eyebrow = 'Recipe editor',
  heading,
  initial,
  notices = [],
  onCancel,
  onSave,
  photoUrl,
  submitLabel = 'Save recipe',
}: RecipeFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [servingCount, setServingCount] = useState(
    initial === undefined ? '2' : String(initial.servingCount ?? ''),
  );
  const [selectedMealTypes, setSelectedMealTypes] = useState<MealType[]>(
    initial?.mealTypes ?? ['dinner'],
  );
  const [cuisines, setCuisines] = useState(
    initial?.tags.cuisines.join(', ') ?? '',
  );
  const [proteins, setProteins] = useState(
    initial?.tags.proteins.join(', ') ?? '',
  );
  const [flavours, setFlavours] = useState(
    initial?.tags.flavours.join(', ') ?? '',
  );
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(
    initial === undefined || initial.ingredients.length === 0
      ? [{ ...emptyIngredient }]
      : initial.ingredients.map((ingredient) => ({
          ...ingredient,
          quantity: String(ingredient.quantity ?? ''),
        })),
  );
  const [instructions, setInstructions] = useState<string[]>(
    initial?.instructions ?? [],
  );
  const currentEstimate =
    initial?.nutritionProvenance?.source === 'cofid'
      ? {
          nutrition: initial.nutrition,
          provenance: initial.nutritionProvenance,
        }
      : undefined;
  const [hasNutrition, setHasNutrition] = useState(
    initial !== undefined &&
      initial.nutrition !== null &&
      currentEstimate === undefined,
  );
  const [nutrition, setNutrition] = useState<NutritionDraft>({
    carbsGrams: String(initial?.nutrition?.carbsGrams ?? ''),
    fatGrams: String(initial?.nutrition?.fatGrams ?? ''),
    kcal: String(initial?.nutrition?.kcal ?? ''),
    proteinGrams: String(initial?.nutrition?.proteinGrams ?? ''),
  });
  const [sourceName, setSourceName] = useState(initial?.source?.name ?? '');
  const [sourceUrl, setSourceUrl] = useState(initial?.source?.url ?? '');
  const [message, setMessage] = useState<string>();
  const [saving, setSaving] = useState(false);

  function updateIngredient(
    index: number,
    field: keyof IngredientDraft,
    value: string,
  ): void {
    setMessage(undefined);
    setIngredients((current) =>
      current.map((ingredient, currentIndex) =>
        currentIndex === index ? { ...ingredient, [field]: value } : ingredient,
      ),
    );
  }

  function updateInstruction(index: number, value: string): void {
    setMessage(undefined);
    setInstructions((current) =>
      current.map((instruction, currentIndex) =>
        currentIndex === index ? value : instruction,
      ),
    );
  }

  function toggleMealType(mealType: MealType): void {
    setMessage(undefined);
    setSelectedMealTypes((current) =>
      current.includes(mealType)
        ? current.filter((value) => value !== mealType)
        : [...current, mealType],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const input = recipeInputSchema.safeParse({
      description,
      ingredients: ingredients.map((ingredient) => ({
        ...ingredient,
        quantity: Number(ingredient.quantity),
      })),
      instructions,
      mealTypes: selectedMealTypes,
      nutrition: hasNutrition
        ? {
            carbsGrams: Number(nutrition.carbsGrams),
            fatGrams: Number(nutrition.fatGrams),
            kcal: Number(nutrition.kcal),
            proteinGrams: Number(nutrition.proteinGrams),
          }
        : null,
      servingCount: Number(servingCount),
      source:
        sourceName.trim() === '' && sourceUrl.trim() === ''
          ? null
          : {
              name: sourceName,
              url: sourceUrl.trim() === '' ? null : sourceUrl,
            },
      tags: {
        cuisines: tagsFrom(cuisines),
        flavours: tagsFrom(flavours),
        proteins: tagsFrom(proteins),
      },
      title,
    });
    if (!input.success) {
      setMessage(
        'Add a title, serving count, meal type, and complete ingredients. Instructions are optional, but added steps cannot be blank.',
      );
      return;
    }

    setSaving(true);
    setMessage(undefined);
    try {
      await onSave(input.data);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'MacroMap could not save.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="recipe-form" onSubmit={submit}>
      <div className="view-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>
            {heading ??
              (initial === undefined ? 'Add a recipe' : 'Edit recipe')}
          </h1>
        </div>
        <button className="text-button" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>

      {notices.length === 0 ? null : (
        <section className="import-warnings" aria-label="Import review notes">
          <h2>Check before saving</h2>
          <ul>
            {notices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        </section>
      )}

      {photoUrl === undefined ? null : (
        <section className="form-section">
          <h2>Primary photo</h2>
          <RecipePhoto
            alt={`Primary photo for ${title || 'imported recipe'}`}
            className="recipe-import-photo"
            photoUrl={photoUrl}
          />
          <p className="section-help">
            This photo will be copied into MacroMap when you save. You can
            replace or remove it afterwards.
          </p>
        </section>
      )}

      <section className="form-section">
        <h2>Basics</h2>
        <div className="form-grid">
          <label className="form-field form-field--wide">
            <span>Title</span>
            <input
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </label>
          <label className="form-field">
            <span>Servings</span>
            <input
              min="0.25"
              onChange={(event) => setServingCount(event.target.value)}
              step="0.25"
              type="number"
              value={servingCount}
            />
          </label>
          <label className="form-field form-field--full">
            <span>Description</span>
            <textarea
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              value={description}
            />
          </label>
        </div>
        <fieldset className="choice-group">
          <legend>Meal type</legend>
          {mealTypes.map(({ label, value }) => (
            <label key={value}>
              <input
                checked={selectedMealTypes.includes(value)}
                onChange={() => toggleMealType(value)}
                type="checkbox"
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
      </section>

      <section className="form-section">
        <div className="section-heading">
          <div>
            <h2>Ingredients</h2>
            <p>Enter the amount used by the complete recipe.</p>
          </div>
          <button
            className="secondary-button compact-button"
            onClick={() =>
              setIngredients((current) => [...current, { ...emptyIngredient }])
            }
            type="button"
          >
            Add ingredient
          </button>
        </div>
        <div className="ingredient-editor">
          {ingredients.map((ingredient, index) => (
            <div className="ingredient-row" key={index}>
              <label className="form-field">
                <span>Amount</span>
                <input
                  aria-label={`Ingredient ${index + 1} amount`}
                  min="0.001"
                  onChange={(event) =>
                    updateIngredient(index, 'quantity', event.target.value)
                  }
                  step="any"
                  type="number"
                  value={ingredient.quantity}
                />
              </label>
              <label className="form-field">
                <span>Unit</span>
                <input
                  aria-label={`Ingredient ${index + 1} unit`}
                  onChange={(event) =>
                    updateIngredient(index, 'unit', event.target.value)
                  }
                  value={ingredient.unit}
                />
              </label>
              <label className="form-field ingredient-name">
                <span>Ingredient</span>
                <input
                  aria-label={`Ingredient ${index + 1} name`}
                  onChange={(event) =>
                    updateIngredient(index, 'name', event.target.value)
                  }
                  value={ingredient.name}
                />
              </label>
              <label className="form-field ingredient-note">
                <span>Preparation note (optional)</span>
                <input
                  aria-label={`Ingredient ${index + 1} preparation note`}
                  onChange={(event) =>
                    updateIngredient(
                      index,
                      'preparationNote',
                      event.target.value,
                    )
                  }
                  value={ingredient.preparationNote}
                />
              </label>
              {ingredients.length > 1 ? (
                <button
                  aria-label={`Remove ingredient ${index + 1}`}
                  className="remove-button"
                  onClick={() =>
                    setIngredients((current) =>
                      current.filter(
                        (_, currentIndex) => currentIndex !== index,
                      ),
                    )
                  }
                  type="button"
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="form-section">
        <div className="section-heading">
          <h2>Instructions</h2>
          <button
            className="secondary-button compact-button"
            onClick={() => setInstructions((current) => [...current, ''])}
            type="button"
          >
            Add step
          </button>
        </div>
        {instructions.length === 0 ? (
          <p className="section-help">
            No instructions yet. You can add them later.
          </p>
        ) : (
          <ol className="instruction-editor">
            {instructions.map((instruction, index) => (
              <li key={index}>
                <textarea
                  aria-label={`Step ${index + 1}`}
                  onChange={(event) =>
                    updateInstruction(index, event.target.value)
                  }
                  rows={3}
                  value={instruction}
                />
                <button
                  aria-label={`Remove instruction ${index + 1}`}
                  className="remove-button"
                  onClick={() =>
                    setInstructions((current) =>
                      current.filter(
                        (_, currentIndex) => currentIndex !== index,
                      ),
                    )
                  }
                  type="button"
                >
                  Remove
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="form-section">
        <h2>Recipe tags</h2>
        <p className="section-help">Separate multiple tags with commas.</p>
        <div className="form-grid form-grid--three">
          <TagField label="Cuisine" onChange={setCuisines} value={cuisines} />
          <TagField
            label="Primary protein"
            onChange={setProteins}
            value={proteins}
          />
          <TagField label="Flavour" onChange={setFlavours} value={flavours} />
        </div>
      </section>

      <section className="form-section">
        <h2>Source</h2>
        <p className="section-help">
          Keep the original author or website attached to imported recipes.
        </p>
        <div className="form-grid">
          <label className="form-field">
            <span>Source name (optional)</span>
            <input
              onChange={(event) => setSourceName(event.target.value)}
              value={sourceName}
            />
          </label>
          <label className="form-field">
            <span>Source URL (optional)</span>
            <input
              onChange={(event) => setSourceUrl(event.target.value)}
              type="url"
              value={sourceUrl}
            />
          </label>
        </div>
      </section>

      <section className="form-section">
        {currentEstimate === undefined ||
        currentEstimate.nutrition === null ||
        hasNutrition ? null : (
          <div className="nutrition-estimate">
            <strong>
              Current CoFID {currentEstimate.provenance.confidence} confidence
              estimate
            </strong>
            <p>
              {formatNutrition(currentEstimate.nutrition)} per serving. MacroMap
              will recalculate it from the ingredients when you save.
            </p>
          </div>
        )}
        <label className="nutrition-toggle">
          <input
            checked={hasNutrition}
            onChange={(event) => setHasNutrition(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>
              {currentEstimate === undefined
                ? 'Add known nutrition'
                : 'Replace the estimate with known nutrition'}
            </strong>
            <small>
              Enter values per serving. These will be treated as authoritative.
            </small>
          </span>
        </label>
        {hasNutrition ? (
          <div className="form-grid form-grid--four nutrition-fields">
            {nutritionFields.map((field) => (
              <label className="form-field" key={field.key}>
                <span>{field.label}</span>
                <span className="input-with-unit">
                  <input
                    aria-label={`Per serving ${field.label}`}
                    min={field.key === 'kcal' ? '0.01' : '0'}
                    onChange={(event) =>
                      setNutrition((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                    step="any"
                    type="number"
                    value={nutrition[field.key]}
                  />
                  <span>{field.unit}</span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="notice">
            MacroMap will try to estimate nutrition from your ingredients using
            CoFID 2021. Any assumed weights or household-measure conversions
            will be shown with the result.
          </p>
        )}
      </section>

      <div className="form-actions">
        <button className="primary-button" disabled={saving} type="submit">
          {saving ? 'Saving…' : submitLabel}
        </button>
        <button className="text-button" onClick={onCancel} type="button">
          Cancel
        </button>
        <p aria-live="polite">{message}</p>
      </div>
    </form>
  );
}

function TagField({
  label,
  onChange,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input onChange={(event) => onChange(event.target.value)} value={value} />
    </label>
  );
}

function tagsFrom(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag !== ''),
    ),
  ];
}

function formatNutrition(nutrition: NonNullable<Recipe['nutrition']>): string {
  return `${nutrition.kcal} kcal · ${nutrition.proteinGrams} g protein · ${nutrition.carbsGrams} g carbs · ${nutrition.fatGrams} g fat`;
}
