import { useEffect, useState } from 'react'
import { publishPost } from '../lib/nostr'
import { marked } from 'marked'

// fetch with the same SimplePool path that works for you
async function fetchEventById(id: string) {
  const { SimplePool }: any = await import('https://esm.sh/nostr-tools@1.17.0')
  const relays = (import.meta.env.VITE_RELAYS as string || '')
    .split(',').map(s => s.trim()).filter(Boolean)
  const pool = new SimplePool()
  return pool.get(relays, { ids: [id] })
}

export default function EditPost({ id }: { id: string }) {
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [md, setMd] = useState('')
  const [dTag, setDTag] = useState<string | undefined>(undefined)
  const [status, setStatus] = useState('Loading…')

  useEffect(()=> {
    (async ()=>{
      const ev: any = await fetchEventById(id)
      if (!ev) { setStatus('Post not found'); return }
      const t = ev.tags.find((t: string[]) => t[0] === 'title')?.[1] || ''
      const s = ev.tags.find((t: string[]) => t[0] === 'summary')?.[1] || ''
      const d = ev.tags.find((t: string[]) => t[0] === 'd')?.[1]
      setTitle(t); setSummary(s); setMd(ev.content || ''); setDTag(d)
      setStatus('')
    })()
  }, [id])

  async function onSave(){
    try{
      setStatus('Publishing edit…')
      const ev = await publishPost(title, summary, md, dTag) // reuse same d
      setStatus('Saved!')
      window.location.hash = `#/post/${ev.id}`
    }catch(e:any){
      setStatus(`Error: ${e?.message || e}`)
    }
  }

  if (status && status.startsWith('Loading')) return <p>{status}</p>
  return (
    <div className="card">
      <h2>Edit Post</h2>
      <div style={{display:'grid', gap:10}}>
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title" />
        <input value={summary} onChange={e=>setSummary(e.target.value)} placeholder="Summary" />
        <textarea value={md} onChange={e=>setMd(e.target.value)} style={{minHeight:220}} />
        <div style={{display:'flex', gap:10, alignItems:'center'}}>
          <button className="btn" onClick={onSave}>Save</button>
          <span className="meta">{status}</span>
        </div>
      </div>
    </div>
  )
}
