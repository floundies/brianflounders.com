import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { marked } from 'marked'
import StatsBar from './StatsBar'

export default function PostView({ id }: { id: string }) {
  const [ev, setEv] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string>('')
  const [canEdit, setCanEdit] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true); setErr('')

        const { SimplePool, nip19 }: any = await import('https://esm.sh/nostr-tools@1.17.0')

        // Build filter from id (hex, note1, or naddr)
        let filter: any
        if (id.startsWith('note1') || id.startsWith('naddr1')) {
          const dec = nip19.decode(id)
          if (dec.type === 'note') filter = { ids: [dec.data] }
          else if (dec.type === 'naddr') {
            const p = dec.data
            filter = { kinds: [p.kind], authors: [p.pubkey] }
            if (p.kind === 30023 && p.identifier) filter['#d'] = [p.identifier]
          } else filter = { ids: [id] }
        } else {
          filter = { ids: [id] }
        }

        const relays = (import.meta.env.VITE_RELAYS as string || '')
          .split(',').map(s => s.trim()).filter(Boolean)

        const pool = new SimplePool()
        const event = await pool.get(relays, filter)

        if (cancelled) return
        if (!event) { setErr('Post not found on current relays'); setEv(null) }
        else setEv(event)
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  // show Edit only if your NIP-07 pubkey matches the author
  useEffect(() => {
    (async () => {
      try {
        if (!ev) { setCanEdit(false); return }
        const ext = (window as any).nostr
        if (!ext?.getPublicKey) { setCanEdit(false); return }
        const k = await ext.getPublicKey()
        setCanEdit(k === ev.pubkey)
      } catch {
        setCanEdit(false)
      }
    })()
  }, [ev])

  if (loading) return <p>Loading…</p>
  if (err) return <div className="card"><p className="meta">Error: {err}</p></div>
  if (!ev) return <div className="card"><p className="meta">Post not found.</p></div>

  const title =
    ev.tags.find((t: string[]) => t[0] === 'title')?.[1] ||
    (ev.content.split('\n')[0]?.replace(/^#\s*/, '')) ||
    'Untitled'
  const summary = ev.tags.find((t: string[]) => t[0] === 'summary')?.[1] || ''
  const ts = dayjs((ev.created_at || 0) * 1000).format('YYYY-MM-DD HH:mm')

  return (
    <article>
      <h2 className="post-title">{title}</h2>
      <div className="meta">{ts}{summary ? ` · ${summary}` : ''}</div>

      {/* stats bar like Habla */}
      <StatsBar ev={ev} />

      <div dangerouslySetInnerHTML={{ __html: marked.parse(ev.content || '') }} />
      <p style={{ display:'flex', gap:10 }}>
        <a className="btn" href="#/">← Back</a>
        {canEdit && <a className="btn" href={`#/edit/${ev.id}`}>Edit</a>}
      </p>
    </article>
  )
}
