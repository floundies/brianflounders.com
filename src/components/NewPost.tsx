import { useRef, useState } from 'react'
import { publishPost } from '../lib/nostr'

export default function NewPost(){
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [md, setMd] = useState('')
  const [status, setStatus] = useState('')
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  function insertAtCursor(snippet: string){
    const ta = taRef.current
    if (!ta) { setMd(m => m + snippet); return }
    const start = ta.selectionStart ?? ta.value.length
    const end = ta.selectionEnd ?? ta.value.length
    const before = md.slice(0, start)
    const after = md.slice(end)
    const next = before + snippet + after
    setMd(next)
    // put cursor after snippet
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + snippet.length
      ta.setSelectionRange(pos, pos)
    })
  }

  function onInsertImage(){
    const url = window.prompt('Image URL (https://...)')
    if (!url) return
    const alt = window.prompt('Alt text (optional)') || ''
    const snippet = `![${alt}](${url})`
    // ensure a newline if not at start
    const prefix = md.endsWith('\n') || md === '' ? '' : '\n\n'
    insertAtCursor(prefix + snippet + '\n\n')
  }

  async function onPublish(){
    try {
      if (!title || !md) { setStatus('Title and content are required.'); return }
      setStatus('Publishing…')
      const ev = await publishPost(title, summary, md)
      setStatus('Published!')
      window.location.hash = `#/post/${ev.id}`
    } catch (e:any) {
      setStatus(`Error: ${e?.message || e}`)
    }
  }

  return (
    <div className="card">
      <h2>New Post</h2>
      <p className="meta">Requires a NIP-07 browser extension (nos2x, Alby, etc.).</p>
      <div style={{display:'grid', gap:10}}>
        <input placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} />
        <input placeholder="Summary (optional)" value={summary} onChange={e=>setSummary(e.target.value)} />

        {/* tiny toolbar */}
        <div style={{display:'flex', gap:8}}>
          <button className="btn" type="button" onClick={onInsertImage}>🖼️ Insert Image</button>
        </div>

        <textarea
          ref={taRef}
          placeholder="# Markdown\nWrite your travel story…"
          value={md}
          onChange={e=>setMd(e.target.value)}
          style={{minHeight:260}}
        />

        <div style={{display:'flex', gap:10, alignItems:'center'}}>
          <button className="btn" onClick={onPublish}>Publish</button>
          <span className="meta">{status}</span>
        </div>
      </div>
    </div>
  )
}
