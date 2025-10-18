import { WebSocket as NodeWebSocket } from "ws"; // provide WebSocket in Node/CF build
globalThis.WebSocket = globalThis.WebSocket || NodeWebSocket;

// generate-sitemap.js
// Build-time sitemap generator for Nostr long-form posts (NIP-23, kind 30023)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { nip19 } from "nostr-tools";

// --- Config ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });

// IMPORTANT: set these in your environment (local .env and Cloudflare Pages variables)
const BASE_URL = process.env.SITE_BASE_URL || "https://brianflounders.com";

// Accept either hex (NOSTR_PUBKEY) or npub (VITE_NOSTR_AUTHOR); decode npub to hex
const RAW_PUB = (process.env.NOSTR_PUBKEY || process.env.VITE_NOSTR_AUTHOR || "").trim();
let PUBKEY = "";
if (RAW_PUB) {
  if (RAW_PUB.startsWith("npub")) {
    try {
      const decoded = nip19.decode(RAW_PUB);
      PUBKEY = typeof decoded.data === "string" ? decoded.data : "";
    } catch {
      PUBKEY = "";
    }
  } else {
    PUBKEY = RAW_PUB; // assume hex
  }
}

// Accept relays from either NOSTR_RELAYS or VITE_RELAYS; sanitize and de-dup
const relayCandidates = (process.env.NOSTR_RELAYS || process.env.VITE_RELAYS || "wss://relay.damus.io,wss://nos.lol,wss://relayable.org")
  .split(",")
  .map(s => s.trim().replace(/\$$/, "")) // strip accidental trailing '$'
  .filter(u => u && u.startsWith("wss://"));

const RELAYS = Array.from(new Set(relayCandidates));
const BACKUP_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://relayable.org",
  "wss://offchain.pub"
];
const RELAY_SET = Array.from(new Set([...RELAYS, ...BACKUP_RELAYS]));

const HASH_POST_PREFIX = "/#/post"; // sitemap will point to #/post/<naddr>

// Fallback priorities/frequencies
const HOMEPAGE = { loc: "/", priority: 1.0, changefreq: "weekly" };
const STATIC_ROUTES = [
  { loc: "/#/tag/cook",       changefreq: "weekly", priority: 0.5 },
  { loc: "/#/tag/briantries", changefreq: "weekly", priority: 0.5 },
  { loc: "/#/tag/build",      changefreq: "weekly", priority: 0.5 },
  { loc: "/#/tag/travel",     changefreq: "weekly", priority: 0.5 },
  { loc: "/#/tag/fitness",    changefreq: "weekly", priority: 0.5 },
  { loc: "/#/tag/family",     changefreq: "weekly", priority: 0.5 },
  { loc: "/#/tag/me",         changefreq: "weekly", priority: 0.5 },
  { loc: "/about.html",      changefreq: "monthly", priority: 0.6 },
];
function extractTagRoutes(events) {
  const tags = new Set();
  for (const ev of events) {
    if (ev?.kind !== 30023) continue;
    for (const t of ev.tags || []) {
      if (t?.[0] === "t" && t?.[1]) {
        tags.add(String(t[1]).toLowerCase());
      }
    }
  }
  return Array.from(tags).map(slug => ({
    loc: `/#/tag/${encodeURIComponent(slug)}`,
    changefreq: "weekly",
    priority: 0.5
  }));
}

// --- Helpers ---
const slugify = (s) =>
  s.toLowerCase()
   .replace(/['’]/g, "")
   .replace(/[^a-z0-9]+/g, "-")
   .replace(/^-+|-+$/g, "");

const xmlEsc = (s) =>
  s.replace(/&/g, "&amp;")
   .replace(/</g, "&lt;")
   .replace(/>/g, "&gt;");

// Prefer tag value by name; else undefined
const tag = (ev, name) => {
  const t = ev.tags?.find(t => t?.[0] === name);
  return t?.[1];
};

const toISODate = (secs) => new Date(secs * 1000).toISOString().slice(0,10);

const toNaddr = (ev) => {
  // Only for longform kind
  if (ev?.kind !== 30023) return null;
  const dTag = tag(ev, "d");
  if (!dTag) return null; // require canonical identifier; otherwise skip
  try {
    // Use a small subset of relays to keep the bech32 shorter, but it's optional
    const relays = RELAY_SET.slice(0, 3);
    return nip19.naddrEncode({
      kind: ev.kind,
      pubkey: ev.pubkey,
      identifier: dTag,
      relays
    });
  } catch {
    return null;
  }
};

// --- Nostr query (NDK) ---
async function fetchNostrLongform() {
  if (!PUBKEY) {
    console.warn("⚠️ NOSTR_PUBKEY not set; skipping Nostr posts.");
    return [];
  }

  console.log("Nostr fetch using", RELAY_SET.length, "relays:", RELAY_SET);

  // Lazy import to keep the script lightweight if nostr-tools evolves
  const { default: NDK } = await import("@nostr-dev-kit/ndk");

  const ndk = new NDK({ explicitRelayUrls: RELAY_SET });
  let events = [];
  try {
    // Connect with a hard timeout
    const connectPromise = ndk.connect();
    const connected = await Promise.race([
      connectPromise.then(() => true),
      new Promise(res => setTimeout(() => res(false), 8000))
    ]);
    if (!connected) {
      console.warn("⚠️ NDK connect timed out; proceeding with whatever is reachable.");
    }

    // Fetch kind 30023 (NIP-23 long-form). Increase limit via ndk.fetchEvents options not needed; server-side enforces.
    const filter = { kinds: [30023], authors: [PUBKEY] };
    const set = await ndk.fetchEvents(filter);
    events = Array.from(set.values() || set);

    // Sort newest first
    events.sort((a,b) => (b.created_at || 0) - (a.created_at || 0));
    console.log("Fetched", events.length, "NIP-23 events for author");
  } catch (e) {
    console.error("Nostr fetch error:", e);
  } finally {
    try { await ndk.pool?.disconnect(); } catch {}
  }
  return events;
}

function mapEventToRoute(ev) {
  // Require NIP-23 longform with a usable naddr (identifier present)
  const naddr = toNaddr(ev);
  if (!naddr) {
    return null; // skip events without proper identifier
  }

  // Build location using hash-based router path
  const loc = `${HASH_POST_PREFIX}/${naddr}`;

  // lastmod priority:
  // Prefer updated_at/published_at tags if present, else created_at
  const updatedAt   = Number(tag(ev, "updated_at")) || 0;
  const publishedAt = Number(tag(ev, "published_at")) || 0;
  const stamp = updatedAt || publishedAt || ev.created_at || Math.floor(Date.now()/1000);

  return {
    loc,
    lastmod: toISODate(stamp),
    changefreq: "monthly",
    priority: 0.8
  };
}

function buildXml(urls) {
  const rows = urls.map(u => `
  <url>
    <loc>${xmlEsc(`${BASE_URL}${u.loc}`)}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
    ${u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : ""}
    ${u.priority != null ? `<priority>${u.priority}</priority>` : ""}
  </url>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows}
</urlset>
`;
}

async function main() {
  const nostrEvents = await fetchNostrLongform();
  const postRoutes  = nostrEvents.map(mapEventToRoute).filter(Boolean);
  const tagRoutes   = extractTagRoutes(nostrEvents);

  if (!postRoutes.length) {
    console.warn("⚠️ No Nostr posts found. Check PUBKEY, relay reachability, and that posts are kind 30023.");
  }
  if (!tagRoutes.length) {
    console.warn("ℹ️ No tag slugs found on NIP-23 posts.");
  }

  // Deduplicate by loc (keep newest lastmod)
  const dedup = new Map();
  [...postRoutes, ...tagRoutes, HOMEPAGE, ...STATIC_ROUTES].forEach(u => {
    const prev = dedup.get(u.loc);
    if (!prev || (u.lastmod && (!prev.lastmod || u.lastmod > prev.lastmod))) {
      dedup.set(u.loc, u);
    }
  });

  const urls = [...dedup.values()];
  const xml  = buildXml(urls);

  // Write under your Vite outDir (default: dist)
  const outPath = path.resolve(__dirname, "dist", "sitemap.xml");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, xml, "utf8");
  console.log(`✅ Wrote ${outPath} with ${urls.length} URLs`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});