// Cloudflare Pages Function: SSR for /post/:id
// - Accepts: hex id, note1..., nevent1..., naddr1...
// - Fetches the event via HTTP (robust fallbacks), renders HTML + meta + JSON-LD
// - Caches at the edge (no KV), then lets your SPA hydrate.

export const onRequestGet: PagesFunction = async (ctx) => {
  const { request, params } = ctx;
  const raw = String(params.id || "").trim();

  // Decode the incoming id into one of:
  //  - { type:"id", id: <64-hex> }
  //  - { type:"addr", kind:number, pubkey:string(hex), d:string }
  const decoded = await decodeIncoming(raw);
  if (!decoded) {
    return htmlResponse(
      htmlShell({
        title: "Bad id – brianflounders.com",
        description: "Unrecognized post identifier.",
        body: `<h1>Bad id</h1><p>Unrecognized post identifier.</p>`,
        canonical: `https://www.brianflounders.com/post/${escapeHtml(raw)}`,
      }),
      { status: 400, cacheSeconds: 600 }
    );
  }

  // Edge cache lookup
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Try to fetch the event from several HTTP endpoints
  const evt = await fetchEventHTTP(decoded, raw);

  if (!evt?.id) {
    const nf = htmlShell({
      title: "Post not found – brianflounders.com",
      description: "We couldn't fetch this Nostr post right now.",
      body: `<h1>Post not found</h1><p>We couldn't fetch this Nostr post right now. Try again later.</p>`,
      canonical: `https://www.brianflounders.com/post/${escapeHtml(raw)}`,
    });
    const res = htmlResponse(nf, { status: 404, cacheSeconds: 600 });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }

  // Extract basics for SEO
  const title =
    getTag(evt, "title") ||
    firstHeading(evt.content) ||
    "Untitled";
  const summary =
    getTag(evt, "summary") ||
    trimForMeta(evt.content, 160);
  const publishedISO = evt.created_at
    ? new Date(evt.created_at * 1000).toISOString()
    : undefined;

  const html = htmlShell({
    title: `${title} – brianflounders.com`,
    description: summary,
    canonical: `https://www.brianflounders.com/post/${evt.id}`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": title,
      ...(publishedISO ? { "datePublished": publishedISO } : {}),
      "author": { "@type": "Person", "name": "Brian Flounders" },
      "url": `https://www.brianflounders.com/post/${evt.id}`,
      "keywords": extractKeywords(evt)
    },
    body: `
      <article style="max-width:780px;margin:40px auto;padding:0 16px;line-height:1.6">
        <h1 style="margin:0 0 12px 0">${escapeHtml(title)}</h1>
        <div style="opacity:.7;font-size:.95rem;margin-bottom:16px">
          ${publishedISO ? new Date(publishedISO).toLocaleString() : ""}
        </div>
        <div>${renderContent(evt.content)}</div>
      </article>

      <!-- Set SPA hash before your app boots so hydration shows same view -->
      <script>
        (function(){
          try{
            if (!location.hash || location.hash.indexOf('/post/') === -1) {
              location.hash = '/post/${evt.id}';
            }
          }catch(e){}
        })();
      </script>
      <script type="module" src="/assets/index.js"></script>
    `,
  });

  const res = htmlResponse(html, { cacheSeconds: 21600 }); // 6h edge cache
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
};

/* ---------------- decoding + HTTP fetch ---------------- */

async function decodeIncoming(raw: string): Promise<
  | { type: "id"; id: string }
  | { type: "addr"; kind: number; pubkey: string; d: string }
  | null
> {
  // 64-hex event id
  if (/^[0-9a-f]{64}$/i.test(raw)) return { type: "id", id: raw.toLowerCase() };

  try {
    const { nip19 }: any = await import("https://esm.sh/nostr-tools@1.17.0");

    const dec = nip19.decode(raw);
    if (!dec) return null;

    if (dec.type === "note" && dec.data) {
      // note1 encodes event id
      return { type: "id", id: String(dec.data).toLowerCase() };
    }

    if (dec.type === "nevent" && dec.data?.id) {
      return { type: "id", id: String(dec.data.id).toLowerCase() };
    }

    if (dec.type === "naddr" && dec.data) {
      const { kind, pubkey, identifier } = dec.data as {
        kind: number; pubkey: string; identifier: string;
      };
      if (kind && pubkey && identifier) {
        return { type: "addr", kind, pubkey: pubkey.toLowerCase(), d: identifier };
      }
    }
  } catch {
    // fall through
  }
  return null;
}

async function fetchEventHTTP(
  key:
    | { type: "id"; id: string }
    | { type: "addr"; kind: number; pubkey: string; d: string },
  raw: string
): Promise<any | null> {
  const urls: string[] = [];

  if (key.type === "id") {
    const id = encodeURIComponent(key.id);
    // direct-by-id + generic search fallbacks
    urls.push(
      `https://api.nostr.band/nostr/event/${id}`,
      `https://api.nostr.band/nostr/search?ids=${id}`,
      // njump proxy returns JSON when "Accept: application/json" (fallback)
      `https://njump.me/api/event/${id}`
    );
  } else {
    // naddr search by components
    const kind = Number(key.kind);
    const author = encodeURIComponent(key.pubkey);
    const d = encodeURIComponent(key.d);
    urls.push(
      `https://api.nostr.band/nostr/search?kind=${kind}&author=${author}&d=${d}`,
      // try naddr directly if the service supports it
      `https://api.nostr.band/nostr/search?naddr=${encodeURIComponent(raw)}`,
      `https://njump.me/api/naddr/${encodeURIComponent(raw)}`
    );
  }

  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { accept: "application/json" } });
      if (!r.ok) continue;
      const j = await r.json();

      // normalize common shapes:
      //  - { event: {...} }
      //  - { events: [...] }
      //  - njump: { event: {...} } or { events: [...] }
      const evt =
        j?.event ??
        (Array.isArray(j?.events) ? j.events[0] : null);

      if (evt?.id && evt?.content) return evt;
    } catch {
      // ignore and try next
    }
  }
  return null;
}

/* ---------------- tiny rendering helpers ---------------- */

function getTag(evt: any, key: string): string | undefined {
  try {
    const hit = (evt?.tags || []).find((t: any[]) => t?.[0] === key);
    return hit?.[1];
  } catch { return undefined; }
}
function extractKeywords(evt: any): string[] {
  try {
    return (evt?.tags || [])
      .filter((t: any[]) => t?.[0] === "t" && t[1])
      .map((t: any[]) => String(t[1]));
  } catch { return []; }
}
function firstHeading(md: string): string | undefined {
  const first = (md || "").split(/\r?\n/)[0]?.trim() || "";
  if (first.startsWith("#")) return first.replace(/^#+\s*/, "").trim();
  return undefined;
}
function trimForMeta(s: string, max = 160): string {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
function escapeHtml(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function linkify(text: string): string {
  const urlRe = /https?:\/\/[^\s<>'"()]+/g;
  return (text || "").replace(urlRe, (u) => `<a href="${u}" target="_blank" rel="noopener">${escapeHtml(u)}</a>`);
}
function renderContent(content: string): string {
  return linkify(content)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}
function htmlShell(opts: {
  title: string;
  description?: string;
  canonical?: string;
  jsonLd?: any;
  body: string;
}) {
  const { title, description, canonical, jsonLd, body } = opts;
  const jsonLdStr = jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : "";
  const desc = description ? `<meta name="description" content="${escapeHtml(description)}">` : "";
  const canon = canonical ? `<link rel="canonical" href="${canonical}">` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
${desc}
${canon}
<meta property="og:title" content="${escapeHtml(title)}">
${description ? `<meta property="og:description" content="${escapeHtml(description)}">` : ""}
<meta property="og:type" content="article">
${jsonLdStr}
</head>
<body>${body}</body>
</html>`;
}
function htmlResponse(html: string, opts?: { status?: number; cacheSeconds?: number }) {
  const status = opts?.status ?? 200;
  const ttl = opts?.cacheSeconds ?? 21600;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=86400`,
    },
  });
}