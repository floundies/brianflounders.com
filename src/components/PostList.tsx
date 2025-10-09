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
        'wss://relay.primal.net',
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
  return ev.tags.some(
    t => t[0] === 'e' && (t[3] === 'reply' || t[3] === 'root' || typeof t[3] === 'undefined')
  )
}

function getD(ev: NEvent): string | undefined { return ev.tags.find(t => t[0] === 'd')?.[1] }
function getTitle(ev: NEvent): string {
  const fromTag = ev.tags.find(t => t[0] === 'title')?.[1]
  if (fromTag) return fromTag
  const firstLine = (ev.content || '').split('\n')[0]?.trim()
  if (firstLine?.startsWith('#')) return firstLine.replace(/^#+\s*/, '')
  return 'Untitled'
}
function getSummary(ev: NEvent): string { return ev.tags.find(t => t[0] === 'summary')?.[1] || '' }

/* -------------------- short-note image allowlist -------------------- */
const IMG_HOST_ALLOW_SET = new Set<string>(['m.primal.net','primal.net','image.nostr.build','i.nostr.build','nostr.build','void.cat'])
function isAllowedHost(hostname: string): boolean {
  if (IMG_HOST_ALLOW_SET.has(hostname)) return true
  if (hostname.endsWith('.primal.net')) return true
  return false
}
const URL_REGEX = /https?:\/\/[^\s<>'"()]+/gi
const IMAGE_EXT_REGEX = /\.(?:png|jpe?g|gif|webp|avif)(?:\?.*)?$/i
function isAllowedImageUrl(u: string): boolean {
  try { const url = new URL(u); return isAllowedHost(url.hostname) && IMAGE_EXT_REGEX.test(url.pathname + url.search) } catch { return false }
}
function extractAllowedImageUrls(text: string): string[] { return (text.match(URL_REGEX) || []).filter(isAllowedImageUrl) }
function removeUrls(text: string, urls: string[]): string { let out = text; for (const u of urls) out = out.replace(u,'').replace(/\s{2,}/g,' '); return out.trim() }

/* -------------------- HERO image helpers (longform) -------------------- */
function isHttpUrl(u: string): boolean { try { const url = new URL(u); return url.protocol === 'http:' || url.protocol === 'https:' } catch { return false } }
function getHeroImageUrl(ev: NEvent): string | undefined {
  const tagKeys = new Set(['image','thumb','cover','banner'])
  const tagCandidate = ev.tags.find(t => tagKeys.has(t[0]))?.[1]
  if (tagCandidate && isHttpUrl(tagCandidate)) return tagCandidate
  const imetas = ev.tags.filter(t => t[0] === 'imeta')
  for (const im of imetas) {
    for (const part of im.slice(1)) {
      const urlMatch = (part.match(URL_REGEX) || [])[0]
      if (urlMatch && isHttpUrl(urlMatch)) return urlMatch
      const mEq = /^url\s*=\s*(https?:\/\/\S+)$/i.exec(part); if (mEq && isHttpUrl(mEq[1])) return mEq[1]
      const mColon = /^url\s*:\s*(https?:\/\/\S+)$/i.exec(part); if (mColon && isHttpUrl(mColon[1])) return mColon[1]
      const mSpace = /^url\s+(https?:\/\/\S+)$/i.exec(part); if (mSpace && isHttpUrl(mSpace[1])) return mSpace[1]
    }
  }
  const fromBody = extractAllowedImageUrls(ev.content)[0]
  if (fromBody) return fromBody
  return undefined
}

/* -------------------- tag match helpers -------------------- */
function hasTag(ev: NEvent, slug: string): boolean {
  const want = (slug || '').toLowerCase()
  if (!want) return false
  // NIP-12 t-tags
  const tHit = ev.tags.some(t => t[0] === 't' && (t[1] || '').toLowerCase() === want)
  if (tHit) return true
  // hashtag fallback from body
  const bodyTags = (ev.content.match(/#[a-z0-9_-]+/gi) || []).map(h => h.slice(1).toLowerCase())
  return bodyTags.includes(want)
}

/* --- tag behavior: which tags include short notes on tag pages? --- */
const TAGS_INCLUDE_NOTES = new Set<string>(['cook','briantries'])

/* =================== Profile fetch (memoized + timeout + pool reuse) =================== */
let __pool: any = null
async function getPool() {
  if (__pool) return __pool
  const { SimplePool }: any = await import('https://esm.sh/nostr-tools@1.17.0')
  __pool = new SimplePool()
  return __pool
}

const avatarPromiseCache = new Map<string, Promise<string | null>>()

function withTimeout<T>(p: Promise<T>, ms = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('profile timeout')), ms)
    p.then(v => { clearTimeout(t); resolve(v) }).catch(e => { clearTimeout(t); reject(e) })
  })
}

async function fetchProfilePictureOnce(pubkey: string, relays: string[]): Promise<string | null> {
  try {
    const { SimplePool }: any = await import('https://esm.sh/nostr-tools@1.17.0')
    const pool = new SimplePool()
    const ev = await withTimeout(pool.get(relays, { kinds: [0], authors: [pubkey] }), 2000)
    // close sockets per run to avoid WS overload in long sessions
    try { pool.close(relays) } catch {}
    if (!ev?.content) return null
    try {
      const meta = JSON.parse(ev.content)
      const url = meta?.picture || meta?.image
      return (url && /^https?:\/\//.test(url)) ? url : null
    } catch { return null }
  } catch { return null }
}

function fetchProfilePictureCached(pubkey: string, relays: string[]): Promise<string | null> {
  const key = pubkey
  const cached = avatarPromiseCache.get(key)
  if (cached) return cached
  const p = fetchProfilePictureOnce(pubkey, relays)
  avatarPromiseCache.set(key, p)
  return p
}

/* ================================================================ */
export default function PostList({ tag }: { tag?: string }) {
  const [items, setItems] = useState<NEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string>('')

  const relays = useMemo(() => relaysFromEnv(), [])
  const authorNpub = (import.meta.env.VITE_NOSTR_AUTHOR as string) || ''

  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        setLoading(true); setErr('')
        const { SimplePool, nip19 }: any = await import('https://esm.sh/nostr-tools@1.17.0')
        const authorHex = npubToHex(authorNpub, nip19)
        if (!authorHex) throw new Error('Bad VITE_NOSTR_AUTHOR')
        const pool = await getPool()

        const lowerTag = (tag || '').toLowerCase()
        const includeNotesForTag = !!lowerTag && TAGS_INCLUDE_NOTES.has(lowerTag)

        // Build relay filters
        const filters = tag ? (
          includeNotesForTag
            ? [{ kinds: [30023, 1], authors: [authorHex], limit: 200 }]
            : [{ kinds: [30023], authors: [authorHex], limit: 200 }]
        ) : [
          { kinds: [30023], authors: [authorHex], limit: 100 },
          { kinds: [1], authors: [authorHex], limit: 100 },
          { kinds: [6], authors: [authorHex], limit: 50 },
        ]

        const evs: NEvent[] = await pool.list(relays, filters)
        if (stop) return

        let filtered = evs
        if (tag) {
          // Tag pages
          if (includeNotesForTag) {
            filtered = evs.filter(ev => (
              (ev.kind === 30023 || (ev.kind === 1 && !isReply(ev))) && hasTag(ev, lowerTag)
            ))
          } else {
            filtered = evs.filter(ev => ev.kind === 30023 && hasTag(ev, lowerTag))
          }
        } else {
          // Home view
          filtered = evs.filter(ev => (
            ev.kind === 6 ||
            ev.kind === 30023 ||
            (ev.kind === 1 && !isReply(ev))
          ))
        }

        filtered.sort((a,b) => (b.created_at||0) - (a.created_at||0))
        setItems(filtered)
      } catch (e:any) { if (!stop) setErr(e?.message || String(e)) }
      finally { if (!stop) setLoading(false) }
    })()
    return () => { stop = true }
  }, [authorNpub, relays, tag])

  if (loading) return <p>Loading…</p>
  if (err) return <div className="card"><p className="meta">Error: {err}</p></div>
  if (!items.length) return <div className="card"><p className="meta">{tag ? `No posts yet for “${tag}”.` : 'No posts yet.'}</p></div>

  return (
    <ul className="list">
      {items.map((ev) => {
        const ts = dayjs(ev.created_at * 1000).format('YYYY-MM-DD HH:mm')

        if (!tag && ev.kind === 6) {
          return (
            <li className="list-row" key={ev.id}>
              <div className="card">
                <RepostCard ev={ev} relays={relays} />
                <div className="meta" style={{ marginTop: 8 }}>
                  <em>{ts} · ↻ repost</em>
                </div>
              </div>
            </li>
          )
        }

        if (ev.kind === 30023) {
          const title = getTitle(ev)
          const summary = getSummary(ev)
          const hero = getHeroImageUrl(ev)
          return (
            <li className="list-row" key={ev.id}>
              <div className="card">
                {hero && (
                  <a href={`#/post/${encodeAnchor(ev)}`} onClick={() => sessionStorage.removeItem('goto_comments')} style={{ display:'block', width:'100%', borderRadius:12, overflow:'hidden', marginBottom:10 }}>
                    <div style={{ position:'relative', width:'100%', aspectRatio:'16 / 9', background:'#000' }}>
                      <img src={hero} alt="" loading="lazy" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', objectPosition:'center', display:'block' }} />
                    </div>
                  </a>
                )}
                <a className="title" href={`#/post/${encodeAnchor(ev)}`} onClick={() => sessionStorage.removeItem('goto_comments')}>{title}</a>
                <div className="meta"><span>{ts}</span>{summary ? <span> · {summary}</span> : null}</div>
                <a
                  href={`#/post/${encodeAnchor(ev)}`}
                  onClick={() => sessionStorage.removeItem('goto_comments')}
                  style={{
                    display: 'inline-block',
                    marginTop: 10,
                    padding: '8px 12px',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.18)',
                    textDecoration: 'none',
                    fontWeight: 600,
                    lineHeight: 1.1,
                  }}
                >
                  Read more →
                </a>
                <div style={{ marginTop: 10 }}>
                  <StatsBar key={`${ev.id}:${tag || 'home'}`} ev={ev} />
                </div>
              </div>
            </li>
          )
        }

        if (ev.kind === 1) {
          // Only show notes on home, or on tag pages that include notes and match the tag
          const lowerTag = (tag || '').toLowerCase()
          if (tag) {
            if (!TAGS_INCLUDE_NOTES.has(lowerTag)) return null
            if (!hasTag(ev, lowerTag)) return null
            if (isReply(ev)) return null
          } else {
            if (isReply(ev)) return null
          }

          const imgs = extractAllowedImageUrls(ev.content)
          const body = removeUrls(ev.content, imgs)
          return (
            <li className="list-row" key={ev.id}>
              <div className="card" style={{ padding: 16 }}>
                <ShortNoteBubble pubkey={ev.pubkey} relays={relays}>
                  <div style={{ whiteSpace:'pre-wrap', overflowWrap:'anywhere', wordBreak:'break-word' }}>{body}</div>
                  {imgs.length > 0 && (
                    <div style={{ marginTop:10, display:'grid', gap:10 }}>
                      {imgs.map((u,i) => (
                        <a key={u+i} href={u} target="_blank" rel="noopener noreferrer">
                          <img src={u} alt="" loading="lazy" style={{ maxWidth:'100%', height:'auto', borderRadius:12, display:'block' }} />
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="meta" style={{ marginTop: 8 }}><em>{ts} · short note</em></div>
                </ShortNoteBubble>
                <div style={{ marginTop: 6 }}>
                  <StatsBar key={`${ev.id}:${tag || 'home'}`} ev={ev} />
                </div>
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
function encodeAnchor(ev: NEvent): string { return encodeNip19(ev, ev.kind) }
function encodeNip19(ev: NEvent, kind: number): string {
  const enc = (window as any).__nip19enc as (x: any) => string | null
  if (enc) return enc({ ev, kind }) || ev.id
  ;(async () => {
    const { nip19 }: any = await import('https://esm.sh/nostr-tools@1.17.0')
    ;(window as any).__nip19enc = ({ ev, kind }: any) => {
      try {
        if (kind === 30023) {
          const d = getD(ev)
          if (d) return nip19.naddrEncode({ kind, pubkey: ev.pubkey, identifier: d })
        }
        return nip19.neventEncode({ id: ev.id, kind: ev.kind, author: ev.pubkey })
      } catch { return null }
    }
  })()
  return ev.id
}

/* =================== Short Note Bubble (avatar + speech bubble) =================== */
function ShortNoteBubble({ pubkey, relays, children }: { pubkey: string; relays: string[]; children: any }) {
  // avatar: undefined => loading; string => url; null => no profile
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let stop = false
    setAvatar(undefined) // show skeleton while loading
    ;(async () => {
      const url = await fetchProfilePictureCached(pubkey, relays)
      if (!stop) setAvatar(url)
    })()
    return () => { stop = true }
  }, [pubkey, relays.join(',')])

  const size = 42
  const bubbleBg = 'rgba(255,255,255,0.04)'
  const bubbleBorder = '1px solid rgba(255,255,255,0.08)'
  const skeletonBg = 'rgba(255,255,255,0.08)'

  return (
    <div style={{ display:'grid', gridTemplateColumns: `${size}px 1fr`, alignItems:'start', gap:12 }}>
      {/* avatar */}
      {avatar === undefined ? (
        // skeleton circle (no text) while loading
        <div style={{ width:size, height:size, borderRadius:'50%', background:skeletonBg }} />
      ) : avatar ? (
        <img src={avatar} alt="" loading="lazy" style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', display:'block', border:'1px solid rgba(255,255,255,0.08)' }} />
      ) : (
        // fallback initials only if we definitively have no profile
        <div style={{ width:size, height:size, borderRadius:'50%', display:'grid', placeItems:'center', background:skeletonBg, fontWeight:600, fontSize:12 }}>
          {initialsFrom(pubkey)}
        </div>
      )}

      {/* speech bubble */}
      <div style={{ position:'relative', maxWidth:'100%' }}>
        <div style={{ background:bubbleBg, padding:'10px 12px', borderRadius:14, border:bubbleBorder }}>
          {children}
        </div>
        {/* tail */}
        <div style={{ position:'absolute', left:-8, top:14, width:0, height:0, borderTop:'8px solid transparent', borderBottom:'8px solid transparent', borderRight:`8px solid ${bubbleBg}` }} />
      </div>
    </div>
  )
}

/* avatar helpers */
function initialsFrom(pubkey: string): string {
  return (pubkey || '').slice(0, 4).toUpperCase()
}