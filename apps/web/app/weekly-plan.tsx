'use client';

import type { SessionResponse, WeeklyPlan } from '@macromap/contracts';
import { useCallback, useEffect, useState } from 'react';
import type { ApiConfig } from './api-client';
import { generateWeeklyPlan, getWeeklyPlan } from './weekly-plan-api';

interface WeeklyPlanViewProps {
  readonly api: ApiConfig | undefined;
  readonly session: SessionResponse;
}

type PlanState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready'; readonly plan: WeeklyPlan }
  | { readonly kind: 'error'; readonly message: string };

export function WeeklyPlanView({ api, session }: WeeklyPlanViewProps) {
  const weekStart = nextMonday();
  const [state, setState] = useState<PlanState>(
    api === undefined ? { kind: 'empty' } : { kind: 'loading' },
  );
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (api === undefined) return;
    setState(await loadPlanState(api, weekStart));
  }, [api, weekStart]);

  useEffect(() => {
    if (api === undefined) return;
    let active = true;
    void loadPlanState(api, weekStart).then((nextState) => {
      if (active) setState(nextState);
    });
    return () => {
      active = false;
    };
  }, [api, weekStart]);

  async function generate(): Promise<void> {
    if (api === undefined) return;
    setGenerating(true);
    try {
      setState({
        kind: 'ready',
        plan: await generateWeeklyPlan(api, weekStart),
      });
    } catch (error) {
      setState({ kind: 'error', message: messageFrom(error) });
    } finally {
      setGenerating(false);
    }
  }

  function retry(): void {
    setState({ kind: 'loading' });
    void load();
  }

  const plan = state.kind === 'ready' ? state.plan : null;
  return (
    <section className="weekly-plan-page" aria-labelledby="weekly-plan-title">
      <header className="weekly-plan-heading">
        <div>
          <p className="eyebrow">Next week</p>
          <h1 id="weekly-plan-title">Your weekly map</h1>
          <p>{weekLabel(weekStart)}</p>
        </div>
        {api !== undefined && state.kind !== 'loading' ? (
          <button
            className="primary-button"
            disabled={generating}
            onClick={() => void generate()}
          >
            {generating
              ? 'Planning…'
              : plan === null
                ? 'Generate draft'
                : 'Regenerate draft'}
          </button>
        ) : null}
      </header>

      {state.kind === 'loading' ? (
        <div className="plan-state" aria-live="polite">
          <p>Loading your draft…</p>
        </div>
      ) : null}
      {state.kind === 'empty' ? (
        <div className="plan-state">
          <h2>No draft yet</h2>
          <p>
            {api === undefined
              ? 'Sign in through the deployed app to plan from your saved recipe library.'
              : 'Generate a first pass from your planning-ready recipes and macro targets.'}
          </p>
        </div>
      ) : null}
      {state.kind === 'error' ? (
        <div className="plan-state" role="alert">
          <h2>We couldn’t load this plan</h2>
          <p>{state.message}</p>
          <button className="secondary-button" onClick={retry}>
            Try again
          </button>
        </div>
      ) : null}
      {plan !== null ? <Plan plan={plan} session={session} /> : null}
    </section>
  );
}

function Plan({
  plan,
  session,
}: {
  plan: WeeklyPlan;
  session: SessionResponse;
}) {
  const people = new Map(session.people.map((person) => [person.id, person]));
  return (
    <>
      {plan.diagnostics.length > 0 ? (
        <aside className="plan-notes" aria-labelledby="plan-notes-title">
          <h2 id="plan-notes-title">Draft notes</h2>
          <ul>
            {plan.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code}-${index}`}>{diagnostic.message}</li>
            ))}
          </ul>
        </aside>
      ) : (
        <p className="plan-ready-note">
          This draft meets the core planning ranges.
        </p>
      )}
      <div className="weekly-timetable">
        {plan.days.map((day) => (
          <article className="plan-day" key={day.date}>
            <header>
              <p>{shortDate(day.date)}</p>
              <h2>{dayName(day.date)}</h2>
            </header>
            <div className="day-meals">
              {day.slots.map(({ meal, mealType }) => (
                <section className="meal-slot" key={mealType}>
                  <p className="meal-slot-label">{mealType}</p>
                  {meal === null ? (
                    <p className="empty-meal">No suitable recipe</p>
                  ) : (
                    <>
                      <h3>{meal.recipeTitle}</h3>
                      <p>
                        {meal.portions
                          .map(
                            (portion) =>
                              `${people.get(portion.personId)?.displayName ?? 'Profile'} ${formatServings(portion.servings)}`,
                          )
                          .join(' · ')}
                      </p>
                      <p className="batch-size">
                        Cook {formatServings(meal.batchServings)} total
                      </p>
                    </>
                  )}
                </section>
              ))}
            </div>
            <div className="day-macros">
              {day.macros.map(({ personId, planned, target }) => (
                <section key={personId}>
                  <div className="macro-heading">
                    <h3>{people.get(personId)?.displayName ?? 'Profile'}</h3>
                    <span
                      className={
                        onTarget(planned, target) ? 'on-target' : 'off-target'
                      }
                    >
                      {onTarget(planned, target) ? 'On target' : 'Check range'}
                    </span>
                  </div>
                  <dl>
                    <Macro
                      label="kcal"
                      planned={planned.kcal}
                      target={target.kcal}
                    />
                    <Macro
                      label="protein"
                      planned={planned.proteinGrams}
                      target={target.proteinGrams}
                      unit="g"
                    />
                    <Macro
                      label="carbs"
                      planned={planned.carbsGrams}
                      target={target.carbsGrams}
                      unit="g"
                    />
                    <Macro
                      label="fat"
                      planned={planned.fatGrams}
                      target={target.fatGrams}
                      unit="g"
                    />
                  </dl>
                </section>
              ))}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function Macro({
  label,
  planned,
  target,
  unit = '',
}: {
  label: string;
  planned: number;
  target: number;
  unit?: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {Math.round(planned)}
        {unit} / {Math.round(target)}
        {unit}
      </dd>
    </div>
  );
}

function onTarget(
  planned: WeeklyPlan['days'][number]['macros'][number]['planned'],
  target: WeeklyPlan['days'][number]['macros'][number]['target'],
): boolean {
  return (
    within(planned.kcal, target.kcal, 0.1) &&
    planned.proteinGrams >= target.proteinGrams &&
    within(planned.carbsGrams, target.carbsGrams, 0.15) &&
    within(planned.fatGrams, target.fatGrams, 0.15)
  );
}

function within(actual: number, target: number, tolerance: number): boolean {
  return target === 0
    ? actual === 0
    : Math.abs(actual / target - 1) <= tolerance;
}

function nextMonday(): string {
  const date = new Date();
  const daysUntilMonday = (8 - date.getDay()) % 7 || 7;
  date.setDate(date.getDate() + daysUntilMonday);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
}

function localDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function weekLabel(weekStart: string): string {
  const end = localDate(weekStart);
  end.setDate(end.getDate() + 6);
  return `${shortDate(weekStart)} – ${end.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`;
}

function dayName(value: string): string {
  return localDate(value).toLocaleDateString('en-GB', { weekday: 'long' });
}

function shortDate(value: string): string {
  return localDate(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

function formatServings(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0$/u, '')} ${value === 1 ? 'serving' : 'servings'}`;
}

function messageFrom(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'MacroMap encountered an unexpected problem.';
}

async function loadPlanState(
  api: ApiConfig,
  weekStart: string,
): Promise<PlanState> {
  try {
    const plan = await getWeeklyPlan(api, weekStart);
    return plan === null ? { kind: 'empty' } : { kind: 'ready', plan };
  } catch (error) {
    return { kind: 'error', message: messageFrom(error) };
  }
}
