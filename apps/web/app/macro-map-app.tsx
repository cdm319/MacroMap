'use client';

import {
  type HouseholdSettings,
  runtimeConfigSchema,
  sessionResponseSchema,
  type CognitoRuntimeConfig,
  type RuntimeConfig,
  type SessionResponse,
} from '@macromap/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  beginSignIn,
  clearSession,
  completeSignIn,
  logoutUrl,
  restoreAccessToken,
} from './auth';
import { HouseholdSettingsView } from './household-settings';
import { RecipeLibrary } from './recipe-library';

const localSession: SessionResponse = {
  household: {
    displayName: 'Chris & Alex',
    id: '00000000-0000-4000-8000-000000000001',
    snackReserve: 0.15,
  },
  people: [
    {
      displayName: 'Chris',
      id: '00000000-0000-4000-8000-000000000101',
      macroTargets: null,
      slug: 'chris',
    },
    {
      displayName: 'Alex',
      id: '00000000-0000-4000-8000-000000000102',
      macroTargets: null,
      slug: 'alex',
    },
  ],
};

type ViewState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'signed-out'; readonly config: CognitoRuntimeConfig }
  | {
      readonly accessToken: string;
      readonly config: CognitoRuntimeConfig;
      readonly kind: 'waking';
    }
  | ReadyView
  | { readonly kind: 'error'; readonly message: string };

type ReadyView =
  | {
      readonly config: Extract<RuntimeConfig, { mode: 'local' }>;
      readonly kind: 'ready';
      readonly session: SessionResponse;
    }
  | {
      readonly accessToken: string;
      readonly config: CognitoRuntimeConfig;
      readonly kind: 'ready';
      readonly session: SessionResponse;
    };

class AuthenticationRequiredError extends Error {}

async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const response = await fetch('/config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('MacroMap configuration is unavailable');
  const config = runtimeConfigSchema.safeParse(await response.json());
  if (config.success) return config.data;
  throw new Error('MacroMap configuration is invalid');
}

async function requestSession(
  config: CognitoRuntimeConfig,
  accessToken: string,
): Promise<{ kind: 'ready'; session: SessionResponse } | { kind: 'waking' }> {
  const response = await fetch(`${config.apiBaseUrl}/v1/session`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 503) return { kind: 'waking' };
  if (response.status === 401) throw new AuthenticationRequiredError();
  if (response.status === 403) {
    throw new Error('This account has not been linked to the household yet');
  }
  if (!response.ok) throw new Error('MacroMap could not load your household');
  return {
    kind: 'ready',
    session: sessionResponseSchema.parse(await response.json()),
  };
}

function friendlyError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'MacroMap encountered an unexpected problem';
}

async function loadAuthenticatedView(
  config: CognitoRuntimeConfig,
  accessToken: string,
): Promise<ViewState> {
  try {
    const result = await requestSession(config, accessToken);
    return result.kind === 'waking'
      ? { accessToken, config, kind: 'waking' }
      : {
          accessToken,
          config,
          kind: 'ready',
          session: result.session,
        };
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error;
    clearSession();
    return { config, kind: 'signed-out' };
  }
}

async function initializeView(): Promise<ViewState> {
  const config = await loadRuntimeConfig();
  if (config.mode === 'local') {
    return { config, kind: 'ready', session: localSession };
  }

  const callbackToken = await completeSignIn(config, window.location.search);
  if (callbackToken !== undefined) {
    window.history.replaceState({}, '', window.location.pathname);
  }
  const accessToken = callbackToken ?? (await restoreAccessToken(config));
  if (accessToken === undefined) return { config, kind: 'signed-out' };

  return loadAuthenticatedView(config, accessToken);
}

export function MacroMapApp() {
  const [view, setView] = useState<ViewState>({ kind: 'loading' });
  const [section, setSection] = useState<'recipes' | 'settings'>('recipes');
  const initialization = useRef<Promise<ViewState> | undefined>(undefined);
  const wakeAttempts = useRef(0);

  const loadAuthenticatedSession = useCallback(
    async (config: CognitoRuntimeConfig, accessToken: string) => {
      try {
        const nextView = await loadAuthenticatedView(config, accessToken);
        if (nextView.kind === 'ready') wakeAttempts.current = 0;
        setView(nextView);
      } catch (error) {
        setView({ kind: 'error', message: friendlyError(error) });
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    initialization.current ??= initializeView();
    void initialization.current
      .then((initialView) => {
        if (active) setView(initialView);
      })
      .catch((error: unknown) => {
        if (active) setView({ kind: 'error', message: friendlyError(error) });
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (view.kind !== 'waking' || wakeAttempts.current >= 6) return;
    const timer = window.setTimeout(() => {
      wakeAttempts.current += 1;
      void loadAuthenticatedSession(view.config, view.accessToken);
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [loadAuthenticatedSession, view]);

  async function signIn(config: CognitoRuntimeConfig): Promise<void> {
    try {
      window.location.assign(await beginSignIn(config));
    } catch (error) {
      setView({ kind: 'error', message: friendlyError(error) });
    }
  }

  function signOut(config: RuntimeConfig): void {
    if (config.mode === 'local') return;
    clearSession();
    window.location.assign(logoutUrl(config));
  }

  async function saveSettings(
    currentView: ReadyView,
    settings: HouseholdSettings,
  ): Promise<SessionResponse> {
    let session: SessionResponse;
    if (!('accessToken' in currentView)) {
      const targets = new Map(
        settings.people.map(({ id, macroTargets }) => [id, macroTargets]),
      );
      session = {
        household: {
          ...currentView.session.household,
          snackReserve: settings.snackReserve,
        },
        people: currentView.session.people.map((person) => ({
          ...person,
          macroTargets: targets.get(person.id) ?? person.macroTargets,
        })),
      };
    } else {
      const response = await fetch(
        `${currentView.config.apiBaseUrl}/v1/household-settings`,
        {
          body: JSON.stringify(settings),
          headers: {
            authorization: `Bearer ${currentView.accessToken}`,
            'content-type': 'application/json',
          },
          method: 'PUT',
        },
      );
      if (response.status === 401) {
        clearSession();
        setView({ config: currentView.config, kind: 'signed-out' });
        throw new Error('Your session ended. Please sign in again.');
      }
      if (response.status === 503) {
        throw new Error('The database is waking. Try saving again shortly.');
      }
      if (!response.ok)
        throw new Error('MacroMap could not save your targets.');
      session = sessionResponseSchema.parse(await response.json());
    }

    setView({ ...currentView, session });
    return session;
  }

  if (view.kind === 'loading') {
    return (
      <main className="page-shell page-shell--centered">
        <section className="status-card" aria-live="polite">
          <p className="eyebrow">MacroMap</p>
          <h1>Setting the table</h1>
          <p>Loading your private household…</p>
        </section>
      </main>
    );
  }

  if (view.kind === 'signed-out') {
    return (
      <main className="page-shell page-shell--centered">
        <section className="welcome-card" aria-labelledby="page-title">
          <div className="brand-mark" aria-hidden="true">
            M
          </div>
          <p className="eyebrow">Plan the week. Hit the numbers.</p>
          <h1 id="page-title">Your meals, mapped.</h1>
          <p className="lede">
            MacroMap builds a practical week of meals around the two of you,
            your macro targets, and one sensible shop.
          </p>
          <button
            className="primary-button"
            onClick={() => signIn(view.config)}
          >
            Sign in to MacroMap
          </button>
          <p className="privacy-note">Private household access only</p>
        </section>
      </main>
    );
  }

  if (view.kind === 'waking') {
    return (
      <main className="page-shell page-shell--centered">
        <section className="status-card" aria-live="polite">
          <div className="pulse" aria-hidden="true" />
          <p className="eyebrow">Just a moment</p>
          <h1>Waking the kitchen</h1>
          <p>
            MacroMap sleeps between visits to keep costs low. This normally
            takes less than a minute.
          </p>
          <button
            className="secondary-button"
            onClick={() =>
              loadAuthenticatedSession(view.config, view.accessToken)
            }
          >
            Try again now
          </button>
        </section>
      </main>
    );
  }

  if (view.kind === 'error') {
    return (
      <main className="page-shell page-shell--centered">
        <section className="status-card" role="alert">
          <p className="eyebrow eyebrow--error">Something went wrong</p>
          <h1>We couldn’t open MacroMap</h1>
          <p>{view.message}</p>
          <button
            className="secondary-button"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="wordmark">
          <span className="brand-mark brand-mark--small" aria-hidden="true">
            M
          </span>
          <span>MacroMap</span>
        </div>
        <nav className="app-navigation" aria-label="Main navigation">
          <button
            aria-current={section === 'recipes' ? 'page' : undefined}
            onClick={() => setSection('recipes')}
          >
            Recipes
          </button>
          <button
            aria-current={section === 'settings' ? 'page' : undefined}
            onClick={() => setSection('settings')}
          >
            Settings
          </button>
        </nav>
        <div className="header-actions">
          {view.config.mode === 'cognito' ? (
            <button
              className="text-button"
              onClick={() => signOut(view.config)}
            >
              Sign out
            </button>
          ) : null}
        </div>
      </header>
      {section === 'recipes' ? (
        <RecipeLibrary
          api={
            'accessToken' in view
              ? {
                  accessToken: view.accessToken,
                  baseUrl: view.config.apiBaseUrl,
                }
              : undefined
          }
        />
      ) : (
        <HouseholdSettingsView
          onSave={(settings) => saveSettings(view, settings)}
          session={view.session}
        />
      )}
    </main>
  );
}
