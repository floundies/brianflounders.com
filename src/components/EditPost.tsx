import { useEffect, useState } from 'react'
import MarkdownEditor from './MarkdownEditor'
import dayjs from 'dayjs'

function relaysFromEnv(){
  return (import.meta.env.VITE_RELAYS as string || '')
    .split(',').map(s => s.trim()).filter(Boolean)
}

export default function EditPost({ id }: { id: string }) {
  const [ev, setEv] = useState<any | null>(null)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [md, setMd] = useState('')
  const [status, setStatus] = useState('Loading…')

  // load the post
  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        const { SimplePool, nip19 }: any = await import('https://esm.sh/nostr-tools@1.17.0')
        const relays = relaysFromEnv()
        const pool = new SimplePool()

        let filter: any
        if (id.startsWith('naddr1') || id.startsWith('nevent1') || id.startsWith('note1')) {
          const dec = nip19.decode(id)
          if (dec.type === 'naddr') {
            const p = dec.data
            filter = { kinds: [p.kind], authors: [p.pubkey] }
            if (p.kind === 30023 && p.identifier) filter['#d'] = [p.identifier]
          } else if (dec.type === 'nevent' || dec.type === 'note') {
            filter = { ids: [dec.type === 'nevent' ? dec.data.id : dec.data] }
          }
        } else filter = { ids: [id] }

        const event = await pool.get(relays, filter)
        if (stop) return

        if (!event) {
          setStatus('Post not found on current relays.')
          return
        }
        setEv(event)
        setTitle(event.tags.find((t: string[]) => t[0]==='title')?.[1] || '')
        setSummary(event.tags.find((t: string[]) => t[0]==='summary')?.[1] || '')
        setMd(event.content || '')
        setStatus('')
      } catch (e:any) {
        if (!stop) setStatus(e?.message || String(e))
      }
    })()
    return () => { stop = true }
  }, [id])

  async function onSave(){
    try{
      if (!ev) return
      setStatus('Publishing update…')
      const ext = (window as any).nostr
      if(!ext?.signEvent) throw new Error('NIP-07 browser signer required')

      const { SimplePool }: any = await import('https://esm.sh/nostr-tools@1.17.0')
      const relays = relaysFromEnv()
      const pool = new SimplePool()

      const d = (ev.tags || []).find((t: string[]) => t[0]==='d')?.[1] || ''
      if (!d) throw new Error('Missing address tag (d) — cannot update')

      // Parameterized replaceable: same kind+pubkey+`d` replaces the old post
      const update = {
        kind: 30023,
        created_at: Math.floor(Date.now()/1000),
        pubkey: '',
        tags: [
          ['d', d],
          ['title', title.trim() || 'Untitled'],
          ...(summary.trim() ? [['summary', summary.trim()]] : []),
          ['client','nostr-blog-starter']
        ],
        content: md
      }
      const signed = await ext.signEvent(update)
      await pool.publish(relays, signed)
      setStatus(`Updated at ${dayjs().format('HH:mm:ss')}`)
      window.location.hash = `#/post/${signed.id}`
    }catch(e:any){
      setStatus(`Error: ${e?.message || e}`)
    }
  }

  if (status && !ev) return <div className="card"><p className="meta">{status}</p></div>

  return (
    <div className="card">
      <h2>Edit Post</h2>
      <p className="meta">Updates replace the original (same <code>d</code> tag).</p>

      <div style={{ display:'grid', gap:10 }}>
        <input placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} />
        <input placeholder="Summary (optional)" value={summary} onChange={e=>setSummary(e.target.value)} />

        <MarkdownEditor value={md} onChange={setMd} />

        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <button className="btn" onClick={onSave}>Save</button>
          <span className="meta">{status}</span>
        </div>
      </div>
    </div>
  )
}
