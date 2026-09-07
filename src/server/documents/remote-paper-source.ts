type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function canonicalHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safePdfContentType(value: string | null): boolean {
  if (!value) return true;
  const mime = value.split(";", 1)[0]?.trim().toLowerCase();
  return mime === "application/pdf"
    || mime === "application/octet-stream"
    || mime === "binary/octet-stream";
}

/**
 * Proxies a canonical Paper's remote PDF through the authenticated Reader URL.
 *
 * Range is forwarded rather than emulated so pdf.js can keep its existing
 * chunked loading path. If an origin ignores Range and answers 200, that 200 is
 * preserved; pdf.js already has a whole-document fallback for such servers.
 * Only representation headers needed by the reader are copied back, never
 * cookies or other origin-controlled response metadata.
 */
export async function proxyRemotePaperPdf(
  request: Request,
  sourceUrl: string,
  fetcher: FetchLike = fetch,
): Promise<Response> {
  const url = canonicalHttpUrl(sourceUrl);
  if (!url) {
    return Response.json({ error: "Canonical paper source is invalid." }, { status: 502 });
  }

  const requestHeaders = new Headers({ accept: "application/pdf" });
  const range = request.headers.get("range");
  if (range) requestHeaders.set("range", range);

  let upstream: Response;
  try {
    upstream = await fetcher(url, {
      headers: requestHeaders,
      redirect: "follow",
      cache: "no-store",
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return Response.json({ error: "Failed to fetch canonical paper source." }, { status: 502 });
  }

  if ((upstream.status !== 200 && upstream.status !== 206) || !upstream.body) {
    await upstream.body?.cancel().catch(() => undefined);
    return Response.json({ error: "Canonical paper source is unavailable." }, { status: 502 });
  }
  if (!safePdfContentType(upstream.headers.get("content-type"))) {
    await upstream.body.cancel().catch(() => undefined);
    return Response.json({ error: "Canonical paper source is not a PDF." }, { status: 502 });
  }

  const headers = new Headers({
    "cache-control": "private, no-store",
    "content-type": "application/pdf",
    "x-content-type-options": "nosniff",
  });
  for (const name of ["content-length", "content-range", "etag", "last-modified"] as const) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  const acceptsRanges = upstream.headers.get("accept-ranges");
  if (acceptsRanges) headers.set("accept-ranges", acceptsRanges);
  else if (upstream.status === 206) headers.set("accept-ranges", "bytes");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
