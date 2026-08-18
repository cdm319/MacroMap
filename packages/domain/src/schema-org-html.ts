export function extractJsonLd(html: string): string | undefined {
  const documents: unknown[] = [];
  const scripts = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu;

  for (const match of html.matchAll(scripts)) {
    if (scriptType(match[1] ?? '') !== 'application/ld+json') continue;
    try {
      documents.push(JSON.parse(match[2]?.trim() ?? ''));
    } catch {
      // Pages often contain unrelated malformed metadata. Valid recipe nodes
      // elsewhere in the document remain usable.
    }
  }

  return documents.length === 0 ? undefined : JSON.stringify(documents);
}

function scriptType(attributes: string): string {
  const match = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/iu.exec(
    attributes,
  );
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '')
    .split(';', 1)[0]!
    .trim()
    .toLowerCase();
}
