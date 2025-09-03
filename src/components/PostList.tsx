// src/components/PostList.tsx
import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import StatsBar from './StatsBar'
import RepostCard from './RepostCard'

type NEvent = {
  id: string
  kind: number
  pubkey: string
  content: string
  tags: string[][]
  created_at: number
}

/* -------------------- relays -------------------- */
function relaysFromEnv(): string[] {
  const raw = (import.meta.env.VITE_RELAYS as string) || ''
  const arr = raw.split(',').map(s => s.trim()).filter(Boolean)
  return arr.length
    ? arr
    : [
        'wss://relay.damus.io',
        'wss://nos.lol',
        'wss://relay.snort.social',
      ]
}

/* -------------------- nip19 helpers -------------------- */
function npubToHex(npubOrHex: string, nip19: any): string {
  if (!npubOrHex) return ''
  if (/^[0-9a-f]{64}$/i.test(npubOrHex)) return npubOrHex
  try {
    const dec = nip19.decode(npubOrHex)
    if (dec?.type === 'npub') return dec.data as string
  } catch {}
  return ''
}

function isReply(ev: NEvent): boolean {
  // replies usually have an 'e' tag with marker 'reply' or 'root'.
  // keep posts that have NO 'e' marker tags (but keep reposts separately).
  return ev.tags.some(
    t =>
      t[0] === 'e' &&
      (t[3] === 'reply' || t[3] === 'root' || typeof t[3] === 'undefined')
  )
}

function getD(ev: NEvent): string | undefined {
  return ev.tags.find(t => t[0] === 'd')?.[1]
}
function getTitle(ev: NEvent): string {
  const fromTag = ev.tags.find(t => t[0] === 'title')?.[1]
  if (fromTag) return fromTag
  const firstLine = (ev.content || '').split('\n')[0]?.trim()
  if (firstLine?.startsWith('#')) return firstLine.replace(/^#+\s*/, '')
  return 'Untitled'
}
function getSummary(ev: NEvent): string {
  return ev.tags.find(t => t[0] === 'summary')?.[1] || ''
}

/* -------------------- short-note image allowlist -------------------- */
/** hosts we will embed images from */
const IMG_HOST_ALLOW = new Set<string>([
  'm.primal.net',
  'primal.net',
  // keep a couple common ones that likely already worked for you
  'image.nostr.build',
  'i.nostr.build',
  'nostr.build',
  'void.cat',
])

// match urls in text
const URL_REGEX = /https?:\/\/[^\s<>'"()]+/gi
// require a real image extension (handles optional query strings)
const IMAGE_EXT_REGEX = /\.(?:png|jpe?g|gif|webp|avif)(?:\?.*)?$/i

function isAllowedImageUrl(u: string): boolean {
  try {
    const url = new URL(u)
    if (!IMG_HOST_ALLOW.has(url.hostname)) return false
    return IMAGE_EXT_REGEX.test(url.pathname + url.search)
  } catch {
    return false
  }
}

function extractAllowedImageUrls(text: string): string[] {
  return (text.match(URL_REGEX) || []).filter(isAllowedImageUrl)
}

function removeUrls(text: string, urls: string[]): string {
  let out = text
  for (const u of urls) out = out.replace(u, '').replace(/\s{2,}/g, ' ')
  return out.trim()
}

/* ================================================================ */

export default function PostList() {
  const [items, setItems] = useState<NEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string>('')

  const relays = useMemo(() => relaysFromEnv(), [])
  const authorNpub = (import.meta.env.VITE_NOSTR_AUTHOR as string) || ''

  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        setLoading(true)
        setErr('')

        // use a stable nostr-tools build that has SimplePool.list(...)
        const { SimplePool, nip19 }: any = await import(
          'https://esm.sh/nostr-tools@1.17.0'
        )

        const authorHex = npubToHex(authorNpub, nip19)
        if (!authorHex) throw new Error('Bad VITE_NOSTR_AUTHOR')

        const pool = new SimplePool()

        const filters = [
          // long-form (NIP-23)
          { kinds: [30023], authors: [authorHex], limit: 100 },
          // short notes (kind 1) — we’ll filter replies out below
          { kinds: [1], authors: [authorHex], limit: 100 },
          // reposts (kind 6)
          { kinds: [6], authors: [authorHex], limit: 50 },
        ]

        const evs: NEvent[] = await pool.list(relays, filters)
        if (stop) return

        // keep: long-form, reposts; for kind-1 keep only non-replies
        const filtered = evs.filter(ev => {
          if (ev.kind === 6) return true
          if (ev.kind === 30023) return true
          if (ev.kind === 1) return !isReply(ev)
          return false
        })

        filtered.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
        setItems(filtered)
      } catch (e: any) {
        if (!stop) setErr(e?.message || String(e))
      } finally {
        if (!stop) setLoading(false)
      }
    })()
    return () => {
      stop = true
    }
  }, [authorNpub, relays])

  if (loading) return <p>Loading…</p>
  if (err) return <div className="card"><p className="meta">Error: {err}</p></div>
  if (!items.length) return <div className="card"><p className="meta">No posts yet.</p></div>

  return (
    <ul className="list">
      {items.map((ev) => {
        const ts = dayjs(ev.created_at * 1000).format('YYYY-MM-DD HH:mm')

        // Repost card
        if (ev.kind === 6) {
          return (
            <li className="list-row" key={ev.id}>
              <div className="card">
                <RepostCard ev={ev} relays={relays} />
                <div className="meta" style={{ marginTop: 8 }}>
                  <em>{ts} · ↻ repost</em>
                </div>
                <div style={{ marginTop: 6 }}>
                  <StatsBar ev={ev} interactive />
                </div>
              </div>
            </li>
          )
        }

        // Long-form NIP-23
        if (ev.kind === 30023) {
          const title = getTitle(ev)
          const summary = getSummary(ev)
          return (
            <li className="list-row" key={ev.id}>
              <div className="card">
                <a
                  className="title"
                  href={`#/post/${encodeAnchor(ev)}`}
                  onClick={() => sessionStorage.removeItem('goto_comments')}
                >
                  {title}
                </a>
                <div className="meta">
                  <span>{ts}</span>
                  {summary ? <span> · {summary}</span> : null}
                </div>
                <div style={{ marginTop: 6 }}>
                  <StatsBar
                    ev={ev}
                    interactive
                    onCommentsClick={() => {
                      // if your StatsBar calls this, jump into PostView at comments
                      sessionStorage.setItem('goto_comments', '1')
                      location.hash = `#/post/${encodeAnchor(ev)}`
                    }}
                  />
                </div>
              </div>
            </li>
          )
        }

        // Short note (kind 1) – inline body, embed allowed images, no link to PostView
        if (ev.kind === 1) {
          const imgs = extractAllowedImageUrls(ev.content)
          const body = removeUrls(ev.content, imgs)

          return (
            <li className="list-row note card" key={ev.id}>
              {/* body text (hard-wrap via CSS) */}
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                }}
              >
                {body}
              </div>

              {/* allowed images (m.primal.net / primal.net, etc.) */}
              {imgs.length > 0 && (
                <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                  {imgs.map((u, i) => (
                    <a key={u + i} href={u} target="_blank" rel="noopener noreferrer">
                      <img
                        src={u}
                        alt=""
                        loading="lazy"
                        style={{ maxWidth: '100%', height: 'auto', borderRadius: 12, display: 'block' }}
                      />
                    </a>
                  ))}
                </div>
              )}

              <div className="meta">
                <em>{ts} · short note</em>
              </div>
              <div style={{ marginTop: 6 }}>
                <StatsBar ev={ev} interactive />
              </div>
            </li>
          )
        }

        return null
      })}
    </ul>
  )
}

/* ---------- helpers ---------- */

function encodeAnchor(ev: NEvent): string {
  // For 30023, prefer naddr (pubkey + kind + d)
  // Fallback to nevent if anything is missing.
  const kind = ev.kind
  return encodeNip19(ev, kind)
}

function encodeNip19(ev: NEvent, kind: number): string {
  // dynamic import only when needed
  // (keeps the top-level from loading more than necessary)
  const enc = (window as any).__nip19enc as (x: any) => string | null
  if (enc) return enc({ ev, kind }) || ev.id
  ;(async () => {
    const { nip19 }: any = await import('https://esm.sh/nostr-tools@1.17.0')
    ;(window as any).__nip19enc = ({ ev, kind }: any) => {
      try {
        if (kind === 30023) {
          const d = getD(ev)
          if (d) {
            return nip19.naddrEncode({
              kind,
              pubkey: ev.pubkey,
              identifier: d,
            })
          }
        }
        return nip19.neventEncode({ id: ev.id, kind: ev.kind, author: ev.pubkey })
      } catch {
        return null
      }
    }
    // no navigation here; PostList already has a stable key; next click will use cache
  })()
  return ev.id
}