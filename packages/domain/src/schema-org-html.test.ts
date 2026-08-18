import { describe, expect, it } from 'vitest';
import { extractJsonLd } from './schema-org-html.js';

describe('Schema.org HTML extraction', () => {
  it('collects valid JSON-LD scripts regardless of attribute order', () => {
    const extracted = extractJsonLd(`
      <html>
        <script nonce="one" type="application/ld+json">
          {"@type":"BreadcrumbList"}
        </script>
        <script TYPE='application/ld+json; charset=utf-8' nonce="two">
          {"@type":"Recipe","name":"Tomato pasta"}
        </script>
      </html>
    `);

    expect(JSON.parse(extracted ?? '')).toEqual([
      { '@type': 'BreadcrumbList' },
      { '@type': 'Recipe', name: 'Tomato pasta' },
    ]);
  });

  it('ignores malformed and non-JSON metadata', () => {
    const extracted = extractJsonLd(`
      <script type="application/ld+json">not json</script>
      <script type="text/javascript">{"@type":"Recipe"}</script>
      <script type="application/ld+json">{"@type":"Recipe","name":"Valid"}</script>
    `);

    expect(JSON.parse(extracted ?? '')).toEqual([
      { '@type': 'Recipe', name: 'Valid' },
    ]);
    expect(extractJsonLd('<html>No metadata</html>')).toBeUndefined();
  });
});
