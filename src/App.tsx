import { useEffect, useState } from 'react'
import PostList from './components/PostList'
import PostView from './components/PostView'
import NewPost from './components/NewPost'
import EditPost from './components/EditPost'
import './styles/subnav.css'

const SITE_TITLE = 'brianflounders.com'

function formatTagLabel(slug: string): string {
  const pretty = slug.replace(/[-_]+/g, ' ').trim()
  return pretty.replace(/\b\w/g, (m) => m.toUpperCase())
}

type Route =
  | { name: 'home' }
  | { name: 'post'; id: string }
  | { name: 'new' }
  | { name: 'edit'; id: string }
  | { name: 'tag'; slug: string }
  | { name: 'me' }

function parseHash(): Route {
  const h = (location.hash || '').replace(/^#/, '')
  // "" | "/" -> home
  if (!h || h === '/' || h === '/home') return { name: 'home' }
  // /post/<id>
  const mPost = h.match(/^\/post\/(.+)$/)
  if (mPost) return { name: 'post', id: decodeURIComponent(mPost[1]) }
  // /new
  if (h === '/new') return { name: 'new' }
  // /edit/<id>
  const mEdit = h.match(/^\/edit\/(.+)$/)
  if (mEdit) return { name: 'edit', id: decodeURIComponent(mEdit[1]) }
  // /me
  if (h === '/me') return { name: 'me' }
  // /tag/<slug>
  const mTag = h.match(/^\/tag\/([^\/]+)$/)
  if (mTag) return { name: 'tag', slug: decodeURIComponent(mTag[1]) }
  return { name: 'home' }
}

function AboutPage() {
  const [text, setText] = useState<string>('')
  const [err, setErr] = useState<string>('')

  useEffect(() => {
    let stop = false
    fetch('/about.md')
      .then(r => { if (!r.ok) throw new Error('about.md not found'); return r.text() })
      .then(t => { if (!stop) setText(t) })
      .catch(e => { if (!stop) setErr(e.message || 'Load error') })
    return () => { stop = true }
  }, [])

  // --- Minimal, safe-ish Markdown rendering (no external libs) ---
  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  function mdToHtml(raw: string): string {
    // 1) Normalize newlines
    let s = raw.replace(/\r\n?/g, '\n')

    // 2) Code blocks ```
    const codeBlocks: string[] = []
    s = s.replace(/```([\s\S]*?)```/g, (_, code) => {
      const i = codeBlocks.push(`<pre><code>${escapeHtml(code)}</code></pre>`) - 1
      return `{{CODE_BLOCK_${i}}}`
    })

    // 3) Escape remaining HTML before inline markdown
    s = escapeHtml(s)

    // 4) Headings (# .. ######)
    s = s.replace(/^######\s*(.*)$/gm, '<h6>$1</h6>')
         .replace(/^#####\s*(.*)$/gm, '<h5>$1</h5>')
         .replace(/^####\s*(.*)$/gm, '<h4>$1</h4>')
         .replace(/^###\s*(.*)$/gm, '<h3>$1</h3>')
         .replace(/^##\s*(.*)$/gm, '<h2>$1</h2>')
         .replace(/^#\s*(.*)$/gm, '<h1>$1</h1>')

    // 5) Lists (simple)
    // unordered
    s = s.replace(/^(\s*)[-*+]\s+(.*)$/gm, '$1<li>$2</li>')
    // ordered
    s = s.replace(/^(\s*)\d+\.\s+(.*)$/gm, '$1<li>$2</li>')
    // wrap consecutive <li> groups into <ul> / <ol>
    s = s.replace(/(?:^|\n)(<li>.*?<\/li>)(?:\n(?!\n|<h\d|<p|<pre|<blockquote|<ul|<ol|<hr>|<li>).*?)*?/gs, (m) => m)
    // group <li> lines into lists
    s = s.replace(/(?:^(?:<li>.*?<\/li>)(?:\n<li>.*?<\/li>)+$)/gm, (block) => {
      // decide ul vs ol by checking if original lines started with digits
      const lines = block.split(/\n/)
      const isOrdered = lines.every(line => /<li>/.test(line)) && /\d\./.test(lines.join('\n'))
      return isOrdered ? `<ol>\n${block}\n<\/ol>` : `<ul>\n${block}\n<\/ul>`
    })

    // 6) Blockquotes
    s = s.replace(/^>\s?(.*)$/gm, '<blockquote>$1</blockquote>')

    // 7) Horizontal rules
    s = s.replace(/^\s*([-*_]){3,}\s*$/gm, '<hr/>')

    // 8) Inline: bold, italic, code, links
    // code spans
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
    // bold ** **
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // italic * * or _ _ (simple)
    s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    s = s.replace(/_([^_]+)_/g, '<em>$1</em>')
    // links [text](url)
    s = s.replace(/\[([^\]]+)\]\((https?:[^\)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')

    // 9) Paragraphs: wrap leftover text lines into <p>
    // Split by double newlines into blocks
    s = s.replace(/(?:\n){2,}/g, '\n\n')
    const parts = s.split(/\n\n/).map(part => {
      if (/^\s*<(h\d|ul|ol|li|pre|blockquote|hr|p|img|code)/.test(part)) return part
      if (/^\s*$/.test(part)) return ''
      return `<p>${part.replace(/\n/g, '<br/>')}</p>`
    })
    s = parts.join('\n')

    // 10) Restore code blocks
    s = s.replace(/\{\{CODE_BLOCK_(\d+)\}\}/g, (_, i) => codeBlocks[Number(i)] || '')

    return s
  }

  const html = text ? mdToHtml(text) : ''

  return (
    <article className="card" style={{ padding: 16 }}>
      {err ? (
        <p className="meta">{err}. Place your file at <code>public/about.md</code>.</p>
      ) : text ? (
        <div
          style={{ lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="meta">Loading…</p>
      )}
    </article>
  )
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash())

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    // Let PostView handle its own title; don’t override here
    if (route.name === 'post') return

    if (route.name === 'home') {
      document.title = SITE_TITLE
      return
    }
    if (route.name === 'me') {
      document.title = `Me — ${SITE_TITLE}`
      return
    }
    if (route.name === 'tag') {
      document.title = `${formatTagLabel(route.slug)} — ${SITE_TITLE}`
      return
    }
    if (route.name === 'new') {
      document.title = `New Post — ${SITE_TITLE}`
      return
    }
    if (route.name === 'edit') {
      document.title = `Edit Post — ${SITE_TITLE}`
      return
    }
  }, [route])

  return (
    <>
      {/* Sticky header */}
      <header className="site">
        <div className="wrap nav">
          <div className="brand">
            <a href="#/">brianflounders.com</a>
          </div>
          <nav className="nav-links">
            <a href="#/new">New Post</a>
          </nav>
        </div>
        {/* Sub-menu */}
        <div className="wrap">
          <nav className="subnav" aria-label="Sections">
            <a className="pill" href="#/" aria-current={route.name === 'home' ? 'page' : undefined}>HOME</a>
            <a className="pill" href="#/me" aria-current={route.name === 'me' ? 'page' : undefined}>ME</a>
            <a className="pill" href="#/tag/family" aria-current={route.name === 'tag' && route.slug === 'family' ? 'page' : undefined}>FAMILY</a>
            <a className="pill" href="#/tag/bitcoin" aria-current={route.name === 'tag' && route.slug === 'bitcoin' ? 'page' : undefined}>BITCOIN</a>
            <a className="pill" href="#/tag/fitness" aria-current={route.name === 'tag' && route.slug === 'fitness' ? 'page' : undefined}>FITNESS</a>
            <a className="pill" href="#/tag/travel" aria-current={route.name === 'tag' && route.slug === 'travel' ? 'page' : undefined}>TRAVEL</a>
            <a className="pill" href="#/tag/build" aria-current={route.name === 'tag' && route.slug === 'build' ? 'page' : undefined}>BUILD</a>
            <a className="pill" href="#/tag/cook" aria-current={route.name === 'tag' && route.slug === 'cook' ? 'page' : undefined}>COOK</a>
            <a className="pill" href="#/tag/briantries" aria-current={route.name === 'tag' && route.slug === 'briantries' ? 'page' : undefined}>TRY</a>
          </nav>
        </div>
      </header>

      {/* Page */}
      <main className="page">
        <div className="wrap">
          {route.name === 'home' && <PostList />}
          {route.name === 'me' && <AboutPage />}
          {route.name === 'tag' && <PostList tag={route.slug} />}
          {route.name === 'post' && <PostView id={route.id} />}
          {route.name === 'new' && <NewPost />}
          {route.name === 'edit' && <EditPost id={route.id} />}
        </div>
      </main>

      <footer className="wrap" style={{ opacity: 0.7, paddingBottom: 28 }}>
        <p className="meta">
          Powered by public Nostr relays (NIP-23). No servers. Deploy anywhere.
        </p>
      </footer>
    </>
  )
}
