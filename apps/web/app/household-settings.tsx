import type { HouseholdSettings, SessionResponse } from '@macromap/contracts';
import { MacroSettingsForm } from './macro-settings-form';

interface HouseholdSettingsViewProps {
  readonly onSave: (settings: HouseholdSettings) => Promise<SessionResponse>;
  readonly session: SessionResponse;
}

export function HouseholdSettingsView({
  onSave,
  session,
}: HouseholdSettingsViewProps) {
  return (
    <section className="dashboard" aria-labelledby="dashboard-title">
      <div className="dashboard-intro">
        <p className="eyebrow">Your household</p>
        <h1 id="dashboard-title">Planning settings</h1>
        <p>
          Set the daily targets MacroMap will use when it plans meals for the
          two of you.
        </p>
      </div>

      <article className="household-card">
        <div>
          <p className="card-label">Planning for</p>
          <h2>{session.household.displayName}</h2>
        </div>
        <div className="people-list">
          {session.people.map((person, index) => (
            <div className="person" key={person.id}>
              <span className={`avatar avatar--${index + 1}`}>
                {person.displayName.slice(0, 1)}
              </span>
              <span>
                <strong>{person.displayName}</strong>
                <small>
                  {person.macroTargets === null
                    ? 'Targets needed'
                    : 'Targets ready'}
                </small>
              </span>
            </div>
          ))}
        </div>
      </article>

      <MacroSettingsForm onSave={onSave} session={session} />
    </section>
  );
}
