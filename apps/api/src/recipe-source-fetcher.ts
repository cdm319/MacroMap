import { lookup } from 'node:dns/promises';
import { request as requestHttp } from 'node:http';
import { request as requestHttps } from 'node:https';
import type { LookupFunction } from 'node:net';
import {
  maxRecipePhotoBytes,
  type RecipePhotoContentType,
} from '@macromap/contracts';

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const supportedPhotos = new Set<RecipePhotoContentType>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const timeoutMilliseconds = 8_000;
const maximumRedirects = 5;
export const maxRecipePageBytes = 1024 * 1024;

interface RemoteResponse {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly location?: string;
  readonly status: number;
}

type AddressResolver = (hostname: string) => Promise<ReadonlyArray<string>>;
type RemoteRequest = (
  url: URL,
  address: string,
  accept: string,
  maximumBytes: number,
  timeout: number,
) => Promise<RemoteResponse>;

export interface RecipeSourceFetcher {
  page(url: string): Promise<{
    readonly content: string;
    readonly finalUrl: string;
    readonly kind: 'html' | 'json';
  }>;
  photo(url: string): Promise<{
    readonly bytes: Uint8Array;
    readonly contentType: RecipePhotoContentType;
  }>;
}

export class RemoteRecipeError extends Error {
  public constructor(
    public readonly code:
      | 'REMOTE_CONTENT_TYPE'
      | 'REMOTE_FETCH_FAILED'
      | 'REMOTE_RESPONSE_TOO_LARGE'
      | 'REMOTE_URL_BLOCKED'
      | 'REMOTE_REDIRECT_LIMIT',
    message: string,
  ) {
    super(message);
    this.name = 'RemoteRecipeError';
  }
}

export function createRecipeSourceFetcher(
  resolve: AddressResolver = resolveAddresses,
  request: RemoteRequest = download,
): RecipeSourceFetcher {
  return {
    async page(rawUrl) {
      const fetched = await fetchRemote(
        rawUrl,
        'text/html, application/ld+json, application/json',
        maxRecipePageBytes,
        resolve,
        request,
      );
      const kind = pageKind(fetched.contentType);
      if (kind === undefined) {
        throw new RemoteRecipeError(
          'REMOTE_CONTENT_TYPE',
          'That URL did not return a recipe webpage.',
        );
      }
      return {
        content: new TextDecoder().decode(fetched.bytes),
        finalUrl: fetched.finalUrl,
        kind,
      };
    },

    async photo(rawUrl) {
      const fetched = await fetchRemote(
        rawUrl,
        'image/jpeg, image/png, image/webp',
        maxRecipePhotoBytes,
        resolve,
        request,
      );
      const contentType = mediaType(fetched.contentType);
      if (!supportedPhotos.has(contentType as RecipePhotoContentType)) {
        throw new RemoteRecipeError(
          'REMOTE_CONTENT_TYPE',
          'The primary photo was not a supported image.',
        );
      }
      return {
        bytes: fetched.bytes,
        contentType: contentType as RecipePhotoContentType,
      };
    },
  };
}

async function fetchRemote(
  rawUrl: string,
  accept: string,
  maximumBytes: number,
  resolve: AddressResolver,
  request: RemoteRequest,
): Promise<RemoteResponse & { readonly finalUrl: string }> {
  const deadline = Date.now() + timeoutMilliseconds;
  const visited = new Set<string>();
  let url = remoteUrl(rawUrl);

  for (let redirects = 0; ; redirects += 1) {
    if (visited.has(url.href) || redirects > maximumRedirects) {
      throw new RemoteRecipeError(
        'REMOTE_REDIRECT_LIMIT',
        'That recipe page redirected too many times.',
      );
    }
    visited.add(url.href);

    const remaining = deadline - Date.now();
    if (remaining <= 0) throw fetchFailed();
    const addresses = await safeResolve(resolve, url.hostname);
    const address = addresses.find(isPublicIpv4);
    if (address === undefined) {
      throw new RemoteRecipeError(
        'REMOTE_URL_BLOCKED',
        'That URL cannot be imported.',
      );
    }

    let response: RemoteResponse;
    try {
      response = await request(url, address, accept, maximumBytes, remaining);
    } catch (error) {
      if (error instanceof RemoteRecipeError) throw error;
      throw fetchFailed();
    }

    if (redirectStatuses.has(response.status)) {
      if (response.location === undefined) throw fetchFailed();
      url = remoteUrl(new URL(response.location, url).href);
      continue;
    }
    if (response.status !== 200) throw fetchFailed();
    if (response.bytes.byteLength > maximumBytes) {
      throw responseTooLarge();
    }
    return { ...response, finalUrl: url.href };
  }
}

function remoteUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw blockedUrl();
  }
  const expectedPort = url.protocol === 'http:' ? '80' : '443';
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username !== '' ||
    url.password !== '' ||
    (url.port !== '' && url.port !== expectedPort) ||
    url.hostname === '' ||
    url.hostname.toLowerCase() === 'localhost' ||
    url.hostname.toLowerCase().endsWith('.localhost')
  ) {
    throw blockedUrl();
  }
  return url;
}

async function safeResolve(
  resolve: AddressResolver,
  hostname: string,
): Promise<ReadonlyArray<string>> {
  try {
    return await resolve(hostname);
  } catch {
    throw fetchFailed();
  }
}

async function resolveAddresses(hostname: string): Promise<string[]> {
  return (await lookup(hostname, { all: true, family: 4, verbatim: true })).map(
    ({ address }) => address,
  );
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a, b, c] = octets as [number, number, number, number];
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function pageKind(contentType: string): 'html' | 'json' | undefined {
  const type = mediaType(contentType);
  if (type === 'text/html' || type === 'application/xhtml+xml') return 'html';
  if (type === 'application/json' || type === 'application/ld+json') {
    return 'json';
  }
  return undefined;
}

function mediaType(contentType: string): string {
  return contentType.split(';', 1)[0]!.trim().toLowerCase();
}

function blockedUrl(): RemoteRecipeError {
  return new RemoteRecipeError(
    'REMOTE_URL_BLOCKED',
    'That URL cannot be imported.',
  );
}

function fetchFailed(): RemoteRecipeError {
  return new RemoteRecipeError(
    'REMOTE_FETCH_FAILED',
    'MacroMap could not reach that recipe page.',
  );
}

function responseTooLarge(): RemoteRecipeError {
  return new RemoteRecipeError(
    'REMOTE_RESPONSE_TOO_LARGE',
    'That recipe page is too large to import.',
  );
}

export function download(
  url: URL,
  address: string,
  accept: string,
  maximumBytes: number,
  timeout: number,
): Promise<RemoteResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const succeed = (response: RemoteResponse): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(response);
    };
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const transport = url.protocol === 'https:' ? requestHttps : requestHttp;
    const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
      if (options.all) {
        callback(null, [{ address, family: 4 }]);
        return;
      }
      callback(null, address, 4);
    };
    const request = transport(
      url,
      {
        headers: {
          accept,
          'user-agent': 'MacroMap recipe importer',
        },
        lookup: pinnedLookup,
        method: 'GET',
      },
      (response) => {
        response.on('error', fail);
        const status = response.statusCode ?? 0;
        const location = header(response.headers.location);
        if (redirectStatuses.has(status)) {
          succeed({
            bytes: new Uint8Array(),
            contentType: '',
            ...(location === undefined ? {} : { location }),
            status,
          });
          response.destroy();
          return;
        }

        const declaredLength = Number(
          header(response.headers['content-length']),
        );
        if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
          fail(responseTooLarge());
          response.destroy();
          return;
        }

        const chunks: Uint8Array[] = [];
        let length = 0;
        response.on('data', (chunk: Uint8Array) => {
          length += chunk.byteLength;
          if (length > maximumBytes) {
            fail(responseTooLarge());
            response.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          const bytes = new Uint8Array(length);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          succeed({
            bytes,
            contentType: header(response.headers['content-type']) ?? '',
            status,
          });
        });
      },
    );
    const timer = setTimeout(() => {
      fail(fetchFailed());
      request.destroy();
    }, timeout);
    request.on('error', fail);
    request.end();
  });
}

function header(
  value: string | ReadonlyArray<string> | undefined,
): string | undefined {
  if (typeof value === 'string' || value === undefined) return value;
  return value[0];
}
