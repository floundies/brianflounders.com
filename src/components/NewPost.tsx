import { useState } from 'react'
import MarkdownEditor from './MarkdownEditor'

function relaysFromEnv(){
  return (import.meta.env.VITE_RELAYS as string || '')
    .split(',').map(s => s.trim()).filter(Boolean)
}
function dTag(){ return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}` }

export default function NewPost(){
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [md, setMd] = useState('')
  const [status, setStatus] = useState('')

  async function onPublish(){
    try{
      if(!title.trim() || !md.trim()){
        setStatus('Title and content are required.')
        return
      }
      setStatus('Publishing…')

      const ext = (window as any).nostr
      if(!ext?.signEvent) throw new Error('NIP-07 browser signer required (e.g., Alby)')

      const { SimplePool }: any = await import('https://esm.sh/nostr-tools@1.17.0')
      const pool = new SimplePool()
      const relays = relaysFromEnv()

      const ev = {
        kind: 30023,
        created_at: Math.floor(Date.now()/1000),
        pubkey: '',
        tags: [
          ['d', dTag()],
          ['title', title.trim()],
          ...(summary.trim() ? [['summary', summary.trim()]] : []),
          ['client', 'nostr-blog-starter']
        ],
        content: md
      }

      const signed = await ext.signEvent(ev)
      await pool.publish(relays, signed)

      setStatus('Published!')
      // go to the fresh event by id
      window.location.hash = `#/post/${signed.id}`
    }catch(e:any){
      setStatus(`Error: ${e?.message || e}`)
    }
  }

  return (
    <div className="card">
      <h2>New Post</h2>
      <p className="meta">Long-form (NIP-23). Images: click the toolbar icon, paste, or drag-drop.</p>

      <div style={{ display:'grid', gap:10 }}>
        <input placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} />
        <input placeholder="Summary (optional)" value={summary} onChange={e=>setSummary(e.target.value)} />

        <MarkdownEditor value={md} onChange={setMd} />

        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <button className="btn" onClick={onPublish}>Publish</button>
          <span className="meta">{status}</span>
        </div>
      </div>
    </div>
  )
}
