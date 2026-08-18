import { maxRecipeImportCharacters } from '@macromap/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  createRecipeSourceFetcher,
  RemoteRecipeError,
} from './recipe-source-fetcher.js';

const publicAddress = '93.184.216.34';

describe('remote recipe fetching', () => {
  it('pins requests to a resolved public IPv4 address', async () => {
    const request = vi.fn().mockResolvedValue(response('<html></html>'));
    const fetcher = createRecipeSourceFetcher(
      vi.fn().mockResolvedValue([publicAddress]),
      request,
    );

    await expect(fetcher.page('https://recipes.example/one')).resolves.toEqual({
      content: '<html></html>',
      finalUrl: 'https://recipes.example/one',
      kind: 'html',
    });
    expect(request).toHaveBeenCalledWith(
      new URL('https://recipes.example/one'),
      publicAddress,
      expect.any(String),
      maxRecipeImportCharacters,
      expect.any(Number),
    );
  });

  it.each([
    'http://127.0.0.1/recipe',
    'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.1/recipe',
  ])('blocks private target %s', async (url) => {
    const request = vi.fn();
    const fetcher = createRecipeSourceFetcher(
      vi.fn().mockResolvedValue([new URL(url).hostname]),
      request,
    );

    await expect(fetcher.page(url)).rejects.toMatchObject({
      code: 'REMOTE_URL_BLOCKED',
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('blocks credentials and nonstandard ports', async () => {
    const resolve = vi.fn();
    const fetcher = createRecipeSourceFetcher(resolve, vi.fn());

    await expect(
      fetcher.page('https://user:password@recipes.example/one'),
    ).rejects.toMatchObject({ code: 'REMOTE_URL_BLOCKED' });
    await expect(
      fetcher.page('https://recipes.example:8443/one'),
    ).rejects.toMatchObject({ code: 'REMOTE_URL_BLOCKED' });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('revalidates redirects and blocks private destinations', async () => {
    const resolve = vi.fn(async (hostname: string) =>
      hostname === 'recipes.example' ? [publicAddress] : ['10.0.0.1'],
    );
    const request = vi.fn().mockResolvedValue({
      bytes: new Uint8Array(),
      contentType: '',
      location: 'http://private.example/recipe',
      status: 302,
    });
    const fetcher = createRecipeSourceFetcher(resolve, request);

    await expect(
      fetcher.page('https://recipes.example/one'),
    ).rejects.toMatchObject({ code: 'REMOTE_URL_BLOCKED' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('rejects redirect loops', async () => {
    const fetcher = createRecipeSourceFetcher(
      vi.fn().mockResolvedValue([publicAddress]),
      vi.fn().mockResolvedValue({
        bytes: new Uint8Array(),
        contentType: '',
        location: '/one',
        status: 302,
      }),
    );

    await expect(
      fetcher.page('https://recipes.example/one'),
    ).rejects.toMatchObject({ code: 'REMOTE_REDIRECT_LIMIT' });
  });

  it('rejects oversized, inaccessible, and non-page responses', async () => {
    const resolve = vi.fn().mockResolvedValue([publicAddress]);
    const oversized = createRecipeSourceFetcher(
      resolve,
      vi
        .fn()
        .mockResolvedValue(response('x'.repeat(maxRecipeImportCharacters + 1))),
    );
    const inaccessible = createRecipeSourceFetcher(
      resolve,
      vi.fn().mockRejectedValue(new Error('socket closed')),
    );
    const wrongType = createRecipeSourceFetcher(
      resolve,
      vi.fn().mockResolvedValue(response('plain text', 'text/plain')),
    );

    await expect(
      oversized.page('https://recipes.example'),
    ).rejects.toMatchObject({ code: 'REMOTE_RESPONSE_TOO_LARGE' });
    await expect(inaccessible.page('https://recipes.example')).rejects.toEqual(
      new RemoteRecipeError(
        'REMOTE_FETCH_FAILED',
        'MacroMap could not reach that recipe page.',
      ),
    );
    await expect(
      wrongType.page('https://recipes.example'),
    ).rejects.toMatchObject({ code: 'REMOTE_CONTENT_TYPE' });
  });
});

function response(content: string, contentType = 'text/html') {
  return {
    bytes: new TextEncoder().encode(content),
    contentType,
    status: 200,
  };
}
