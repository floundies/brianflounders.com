import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import StatsBar from './StatsBar'
import RepostCard from './RepostCard'
import { titleFrom, summaryFrom } from '../lib/nostr'

const clamp = (s: string, n = 180) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s)

// ---- helpers to extract/strip image URLs from note text ----
function imageUrlsFrom(text: string) {
  const urls = Array.from((text || '').matchAll(/https?:\/\/\S+/g)).map(m => m[0])
  return urls.filter(u => /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(u))
}
function stripImageUrls(text: string) {
  return (text || '')
    .replace(/https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export default function PostList({ author }: { author: string }) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true); setErr('')

        const { SimplePool, nip19 }: any = await import('https://esm.sh/nostr-tools@1.17.0')
        const hex = author?.startsWith('npub') ? nip19.decode(author).data : author
        if (!hex) throw new Error('No author pubkey')

        const relays = (import.meta.env.VITE_RELAYS as string || '')
          .split(',').map(s => s.trim()).filter(Boolean)

        const pool = new SimplePool()
        const [longform, shortAndReposts] = await Promise.all([
          pool.list(relays, [{ kinds: [30023], authors: [hex], limit: 50 }]),
          pool.list(relays, [{ kinds: [1, 6], authors: [hex], limit: 80 }])
        ])

        const notesTopLevel = shortAndReposts.filter((ev: any) =>
          ev.kind === 1 && !(ev.tags || []).some((t: string[]) => t[0] === 'e')
        )
        const reposts = shortAndReposts.filter((ev: any) => ev.kind === 6)

        const merged = [...longform, ...notesTopLevel, ...reposts]
          .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))

        if (!cancelled) setItems(merged)
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [author])

  if (loading) return <p>Loading…</p>
  if (err) return <div className="card"><p className="meta">Error: {err}</p></div>
  if (!items.length) return <div className="card"><p className="meta">No posts found. Try publishing, or broaden your relay list.</p></div>

  return (
    <ul>
      {items.map((ev: any) => {
        const ts = dayjs((ev.created_at || 0) * 1000).format('YYYY-MM-DD HH:mm')

        // LONG-FORM (NIP-23 kind 30023)
        if (ev.kind === 30023) {
          const t = titleFrom(ev)
          const s = summaryFrom(ev)
          return (
            <li key={ev.id} className="list-row">
              <a className="post-title" href={`#/post/${ev.id}`}>{t}</a>
              <div className="meta">{ts}{s ? ` · ${clamp(s)}` : ''}</div>
              <StatsBar ev={ev} lazy compact />
            </li>
          )
        }

        // SHORT NOTE (kind 1, not a reply) – full text + inline images
        if (ev.kind === 1) {
          const text = ev.content || ''
          const clean = stripImageUrls(text)
          const imgs = imageUrlsFrom(text)
          return (
            <li key={ev.id} className="list-row note">
              {clean && <div style={{ whiteSpace: 'pre-wrap' }}>{clean}</div>}
              {imgs.map((u, i) => (
                <img key={i} src={u} alt="" style={{ maxWidth: '100%', height: 'auto', borderRadius: 8, marginTop: 8 }} />
              ))}
              <div className="meta"><em>{ts}</em></div>
              <StatsBar ev={ev} lazy compact />
            </li>
          )
        }

        // REPOST (kind 6) – render original inline
        return (
          <li key={ev.id} className="list-row repost">
            <RepostCard ev={ev} />
          </li>
        )
      })}
    </ul>
  )
}
