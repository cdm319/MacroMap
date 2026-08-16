export interface CognitoRuntimeConfig {
  readonly apiBaseUrl: string;
  readonly authBaseUrl: string;
  readonly clientId: string;
  readonly mode: 'cognito';
  readonly redirectUri: string;
}

export interface LocalRuntimeConfig {
  readonly mode: 'local';
}

export type RuntimeConfig = CognitoRuntimeConfig | LocalRuntimeConfig;

interface CognitoTokens {
  readonly accessToken: string;
  readonly expiresAt: number;
  readonly refreshToken?: string;
}

interface TokenResponse {
  readonly access_token: string;
  readonly expires_in: number;
  readonly refresh_token?: string;
}

const tokenStorageKey = 'macromap.tokens';
const verifierStorageKey = 'macromap.pkce.verifier';
const stateStorageKey = 'macromap.pkce.state';

function cognitoUrl(config: CognitoRuntimeConfig, path: string): URL {
  return new URL(`${config.authBaseUrl.replace(/\/$/u, '')}${path}`);
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function randomValue(size = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(size)));
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}

function parseTokenResponse(value: unknown): TokenResponse {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('access_token' in value) ||
    typeof value.access_token !== 'string' ||
    !('expires_in' in value) ||
    typeof value.expires_in !== 'number'
  ) {
    throw new Error('Cognito returned an invalid token response');
  }

  const refreshToken =
    'refresh_token' in value && typeof value.refresh_token === 'string'
      ? value.refresh_token
      : undefined;
  return {
    access_token: value.access_token,
    expires_in: value.expires_in,
    ...(refreshToken === undefined ? {} : { refresh_token: refreshToken }),
  };
}

async function requestTokens(
  config: CognitoRuntimeConfig,
  parameters: Record<string, string>,
): Promise<TokenResponse | undefined> {
  const response = await fetch(cognitoUrl(config, '/oauth2/token'), {
    body: new URLSearchParams({ client_id: config.clientId, ...parameters }),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  });

  return response.ok ? parseTokenResponse(await response.json()) : undefined;
}

function storeTokens(response: TokenResponse, refreshToken?: string): string {
  const resolvedRefreshToken = response.refresh_token ?? refreshToken;
  const tokens: CognitoTokens = {
    accessToken: response.access_token,
    expiresAt: Date.now() + response.expires_in * 1_000,
    ...(resolvedRefreshToken === undefined
      ? {}
      : { refreshToken: resolvedRefreshToken }),
  };
  sessionStorage.setItem(tokenStorageKey, JSON.stringify(tokens));
  return tokens.accessToken;
}

export async function beginSignIn(
  config: CognitoRuntimeConfig,
): Promise<string> {
  const verifier = randomValue(64);
  const state = randomValue();
  sessionStorage.setItem(verifierStorageKey, verifier);
  sessionStorage.setItem(stateStorageKey, state);

  const url = cognitoUrl(config, '/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: config.clientId,
    code_challenge: await codeChallenge(verifier),
    code_challenge_method: 'S256',
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  }).toString();
  return url.toString();
}

export async function completeSignIn(
  config: CognitoRuntimeConfig,
  search: string,
): Promise<string | undefined> {
  const parameters = new URLSearchParams(search);
  const cognitoError = parameters.get('error_description');
  if (parameters.has('error')) {
    throw new Error(cognitoError ?? 'Cognito could not complete sign-in');
  }
  const code = parameters.get('code');
  if (code === null) return undefined;

  const expectedState = sessionStorage.getItem(stateStorageKey);
  const verifier = sessionStorage.getItem(verifierStorageKey);
  if (
    expectedState === null ||
    verifier === null ||
    parameters.get('state') !== expectedState
  ) {
    throw new Error('The sign-in response could not be verified');
  }

  const tokens = await requestTokens(config, {
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
  });
  if (tokens === undefined) {
    throw new Error('Cognito did not accept the sign-in code');
  }

  sessionStorage.removeItem(verifierStorageKey);
  sessionStorage.removeItem(stateStorageKey);
  return storeTokens(tokens);
}

export async function restoreAccessToken(
  config: CognitoRuntimeConfig,
): Promise<string | undefined> {
  const serialized = sessionStorage.getItem(tokenStorageKey);
  if (serialized === null) return undefined;

  let tokens: CognitoTokens;
  try {
    tokens = JSON.parse(serialized) as CognitoTokens;
  } catch {
    clearSession();
    return undefined;
  }
  if (
    typeof tokens.accessToken !== 'string' ||
    typeof tokens.expiresAt !== 'number'
  ) {
    clearSession();
    return undefined;
  }
  if (tokens.expiresAt > Date.now() + 30_000) return tokens.accessToken;
  if (typeof tokens.refreshToken !== 'string') {
    clearSession();
    return undefined;
  }

  const refreshedTokens = await requestTokens(config, {
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
  });
  if (refreshedTokens === undefined) {
    clearSession();
    return undefined;
  }
  return storeTokens(refreshedTokens, tokens.refreshToken);
}

export function clearSession(): void {
  sessionStorage.removeItem(tokenStorageKey);
  sessionStorage.removeItem(verifierStorageKey);
  sessionStorage.removeItem(stateStorageKey);
}

export function logoutUrl(config: CognitoRuntimeConfig): string {
  const url = cognitoUrl(config, '/logout');
  url.search = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: config.redirectUri,
  }).toString();
  return url.toString();
}
