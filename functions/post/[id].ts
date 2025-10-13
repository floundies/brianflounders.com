export const onRequestGet: PagesFunction = async (ctx) => {
  const { request, params } = ctx;
  const id = String(params.id || "").trim();

  // Basic sanity
  if (!/^[a-z0-9]+$/i.test(id)) {
    return new Response("Bad id", { status: 400 });
  }

  // Edge cache lookup
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Try multiple HTTP sources (no WebSocket in Workers; keeps this free/simple)
  const sources = [
    // nostr.band HTTP event endpoint (public; subject to rate limits)
    `https://api.nostr.band/nostr/event/${id}`,
    // fallback via search-by-id (same service; structure differs)
    `https://api.nostr.band/nostr/search?kind=30023&id=${id}`,
  ];

  let evt: any | null = null;
  for (const url of sources) {
    try {
      const r = await fetch(url, { headers: { "accept": "application/json" } });
      if (!r.ok) continue;
      const j = await r.json();
      // normalize shape from different endpoints
      evt = j?.event ?? (Array.isArray(j?.events) ? j.events.find((e: any) => e?.id === id) : null);
      if (evt?.id) break;
    } catch {}
  }

  if (!evt?.id) {
    // Serve a gentle HTML (not JSON) to keep crawlers happy
    const nf = htmlShell({
      title: "Post not found – brianflounders.com",
      description: "We couldn't fetch this Nostr post right now.",
      body: `<h1>Post not found</h1><p>We couldn't fetch this Nostr post right now. Try again later.</p>`,
      canonical: `https://www.brianflounders.com/post/${id}`,
    });
    const res = new Response(nf, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=0, s-maxage=600, stale-while-revalidate=86400",
      },
      status: 404,
    });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }

  // Extract basics
  const title =
    (evt.tags?.find((t: any) => t?.[0] === "title")?.[1] as string) ||
    firstHeading(evt.content) ||
    "Untitled";
  const summary =
    (evt.tags?.find((t: any) => t?.[0] === "summary")?.[1] as string) ||
    trimForMeta(evt.content, 160);
  const publishedISO = evt.created_at ? new Date(evt.created_at * 1000).toISOString() : undefined;

  // Render HTML w/ meta + JSON-LD.
  // Important: we add a tiny inline script that, if JS runs,
  // sets the hash to the SPA route BEFORE your app boots.
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
    },
    body: `
      <article style="max-width:780px;margin:40px auto;padding:0 16px;line-height:1.6">
        <h1 style="margin:0 0 12px 0">${escapeHtml(title)}</h1>
        <div style="opacity:.7;font-size:.95rem;margin-bottom:16px">${publishedISO ? new Date(publishedISO).toLocaleString() : ""}</div>
        <div>${renderContent(evt.content)}</div>
      </article>
      <script>
        // If JS is enabled, shift to your SPA's hash route before the app boots.
        (function(){
          try{
            if (!location.hash || location.hash.indexOf('/post/') === -1) {
              location.hash = '/post/${evt.id}';
            }
          }catch(e){}
        })();
      </script>
      <!-- Load your app AFTER we set the hash so hydration shows the same post view -->
      <script type="module" src="/assets/index.js"></script>
    `,
  });

  const res = new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
};

/* ---------------- helpers (pure) ---------------- */

function firstHeading(md: string): string | undefined {
  const firstLine = (md || "").split(/\r?\n/)[0]?.trim() || "";
  if (firstLine.startsWith("#")) return firstLine.replace(/^#+\s*/, "").trim();
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
  // Simple, safe-ish HTML: paragraphs + linkified URLs.
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