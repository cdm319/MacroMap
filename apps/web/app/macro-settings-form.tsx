import {
  householdSettingsSchema,
  type HouseholdSettings,
  type SessionResponse,
} from '@macromap/contracts';
import { useState, type FormEvent } from 'react';

interface MacroSettingsFormProps {
  readonly onSave: (settings: HouseholdSettings) => Promise<SessionResponse>;
  readonly session: SessionResponse;
}

interface PersonDraft {
  readonly displayName: string;
  readonly id: string;
  readonly carbsGrams: string;
  readonly fatGrams: string;
  readonly kcal: string;
  readonly proteinGrams: string;
}

const fields = [
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
  { key: 'proteinGrams', label: 'Protein', unit: 'g' },
  { key: 'carbsGrams', label: 'Carbs', unit: 'g' },
  { key: 'fatGrams', label: 'Fat', unit: 'g' },
] as const;

function personDrafts(session: SessionResponse): PersonDraft[] {
  return session.people.map(({ displayName, id, macroTargets }) => ({
    carbsGrams: String(macroTargets?.carbsGrams ?? ''),
    displayName,
    fatGrams: String(macroTargets?.fatGrams ?? ''),
    id,
    kcal: String(macroTargets?.kcal ?? ''),
    proteinGrams: String(macroTargets?.proteinGrams ?? ''),
  }));
}

function numberFrom(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

export function MacroSettingsForm({ onSave, session }: MacroSettingsFormProps) {
  const [people, setPeople] = useState(() => personDrafts(session));
  const [snackReserve, setSnackReserve] = useState(
    String(session.household.snackReserve * 100),
  );
  const [message, setMessage] = useState<string>();
  const [saving, setSaving] = useState(false);

  function updatePerson(
    personId: string,
    field: (typeof fields)[number]['key'],
    value: string,
  ): void {
    setMessage(undefined);
    setPeople((current) =>
      current.map((person) =>
        person.id === personId ? { ...person, [field]: value } : person,
      ),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const settings = householdSettingsSchema.safeParse({
      people: people.map((person) => ({
        id: person.id,
        macroTargets: {
          carbsGrams: numberFrom(person.carbsGrams),
          fatGrams: numberFrom(person.fatGrams),
          kcal: numberFrom(person.kcal),
          proteinGrams: numberFrom(person.proteinGrams),
        },
      })),
      snackReserve: numberFrom(snackReserve) / 100,
    });
    if (!settings.success) {
      setMessage('Enter a complete set of valid targets for both people.');
      return;
    }

    setSaving(true);
    setMessage(undefined);
    try {
      const saved = await onSave(settings.data);
      setPeople(personDrafts(saved));
      setSnackReserve(String(saved.household.snackReserve * 100));
      setMessage('Targets saved.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'MacroMap could not save.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-card" onSubmit={submit}>
      <div className="settings-heading">
        <div>
          <p className="card-label">Planning settings</p>
          <h2>Daily macro targets</h2>
        </div>
        <label className="reserve-field">
          <span>Reserved for snacks</span>
          <span className="input-with-unit">
            <input
              aria-label="Reserved for snacks"
              max="99"
              min="0"
              onChange={(event) => {
                setMessage(undefined);
                setSnackReserve(event.target.value);
              }}
              required
              step="1"
              type="number"
              value={snackReserve}
            />
            <span>%</span>
          </span>
        </label>
      </div>

      <p className="settings-help">
        Enter full-day targets. The snack reserve is held back from calories;
        protein, carbs and fat use the full targets.
      </p>

      <div className="target-grid">
        {people.map((person) => (
          <fieldset className="target-card" key={person.id}>
            <legend>{person.displayName}</legend>
            <div className="macro-fields">
              {fields.map((field) => (
                <label key={field.key}>
                  <span>{field.label}</span>
                  <span className="input-with-unit">
                    <input
                      aria-label={`${person.displayName} ${field.label}`}
                      min={field.key === 'kcal' ? '1' : '0'}
                      onChange={(event) =>
                        updatePerson(person.id, field.key, event.target.value)
                      }
                      required
                      step={field.key === 'kcal' ? '1' : '0.1'}
                      type="number"
                      value={person[field.key]}
                    />
                    <span>{field.unit}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="settings-actions">
        <button className="primary-button" disabled={saving} type="submit">
          {saving ? 'Saving…' : 'Save targets'}
        </button>
        <p aria-live="polite">{message}</p>
      </div>
    </form>
  );
}
