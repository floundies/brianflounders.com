import * as React from 'react'
import PostList from './components/PostList'
import PostView from './components/PostView'
import NewPost from './components/NewPost'
import EditPost from './components/EditPost'
// import './styles/subnav.css'

const SITE_TITLE = 'brianflounders.com'

function formatTagLabel(slug: string): string {
  // custom titles for specific slugs
  const customTitles: Record<string, string> = {
    briantries: "Brian Tries…",
  }
  // if a custom title exists, return it
  if (customTitles[slug.toLowerCase()]) {
    return customTitles[slug.toLowerCase()]
  }
  // default: capitalize words
  const pretty = slug.replace(/[-_]+/g, ' ').trim()
  return pretty.replace(/\b\w/g, (m) => m.toUpperCase())
}

type Route =
  | { name: 'home' }
  | { name: 'post'; id: string }
  | { name: 'new' }
  | { name: 'edit'; id: string }
  | { name: 'tag'; slug: string }

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
  // /tag/<slug>
  const mTag = h.match(/^\/tag\/([^\/]+)$/)
  if (mTag) return { name: 'tag', slug: decodeURIComponent(mTag[1]) }
  return { name: 'home' }
}

// --- helpers to keep home feed clean (hide replies/reposts/reactions) ---
// minimal Nostr event shape for our filter
type NEvent = { kind: number; tags?: string[][] };

function isThreadReply(ev: NEvent): boolean {
  if (ev.kind !== 1) return false; // only applies to short notes
  const tags = ev.tags || [];
  let hasThreadRef = false;
  let hasThreadMarker = false;

  for (const t of tags) {
    if (!t || t.length === 0) continue;
    if (t[0] === 'e' || t[0] === 'a') {
      hasThreadRef = true;
      // NIP-10/NIP-23 markers typically at index 3
      if (t[3] === 'reply' || t[3] === 'root') hasThreadMarker = true;
    }
  }

  // explicit markers mean it's part of a thread
  if (hasThreadMarker) return true;
  // fallback: any e/a reference -> treat as reply to be conservative
  return hasThreadRef;
}

// keep only items we want visible on HOME
function homeFilterFn(ev: NEvent): boolean {
  // hide reposts (kind 6) and reactions (kind 7)
  if (ev.kind === 6 || ev.kind === 7) return false;
  // hide short-note replies
  if (ev.kind === 1 && isThreadReply(ev)) return false;
  return true; // keep everything else (e.g., 30023 long-form, top-level kind-1)
}
// --- end helpers ---

export default function App() {
  const [route, setRoute] = React.useState<Route>(parseHash())

  React.useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  React.useEffect(() => {
    // Let PostView handle its own title + GA
    if (route.name === 'post') return

    const sendGA = (window as any).__sendPageView
    if (route.name === 'home') {
      document.title = SITE_TITLE
      sendGA?.('/', SITE_TITLE)
      return
    }
    if (route.name === 'tag') {
      const t = `${formatTagLabel(route.slug)} — ${SITE_TITLE}`
      document.title = t
      sendGA?.(`/tag/${route.slug}`, t)
      return
    }
    if (route.name === 'new') {
      document.title = `New Post — ${SITE_TITLE}`
      sendGA?.('/new', document.title)
      return
    }
    if (route.name === 'edit') {
      document.title = `Edit Post — ${SITE_TITLE}`
      sendGA?.('/edit', document.title)
      return
    }
  }, [route])

  return (
    <>
      {/* Masthead — scrolls away */}
      <div className="masthead">
        <div className="wrap nav">
          <div className="brand">
            <a href="#/"><img src="/bfmonogram.png" alt="brianflounders.com" className="brand__monogram" /></a>
          </div>
        </div>
      </div>

      {/* Sticky nav */}
      <header className="site">
        <div className="wrap">
          <nav className="subnav" aria-label="Sections">
            <a className="pill" href="#/" aria-current={route.name === 'home' ? 'page' : undefined}>HOME</a>
            <a className="pill" href="/about.html">ME</a>
            <a className="pill" href="#/tag/family" aria-current={route.name === 'tag' && route.slug === 'family' ? 'page' : undefined}>FAMILY</a>
            <a className="pill" href="#/tag/bitcoin" aria-current={route.name === 'tag' && route.slug === 'bitcoin' ? 'page' : undefined}>BITCOIN</a>
            <a className="pill" href="#/tag/fitness" aria-current={route.name === 'tag' && route.slug === 'fitness' ? 'page' : undefined}>FITNESS</a>
            <a className="pill" href="#/tag/travel" aria-current={route.name === 'tag' && route.slug === 'travel' ? 'page' : undefined}>TRAVEL</a>
            <a className="pill" href="#/tag/create" aria-current={route.name === 'tag' && route.slug === 'create' ? 'page' : undefined}>CREATE</a>
            <a className="pill" href="#/tag/cook" aria-current={route.name === 'tag' && route.slug === 'cook' ? 'page' : undefined}>COOK</a>
            <a className="pill" href="#/tag/briantries" aria-current={route.name === 'tag' && route.slug === 'briantries' ? 'page' : undefined}>TRY</a>
            <a className="pill pill--junto" href="/junto/">JUNTO</a>
          </nav>
        </div>
      </header>

      {/* Page */}
      <main className="page">
        <div className="wrap">
          {route.name === 'home' && <PostList filterFn={homeFilterFn} />}
          {route.name === 'tag' && <PostList tag={route.slug} />}
          {route.name === 'post' && <PostView id={route.id} />}
          {route.name === 'new' && <NewPost />}
          {route.name === 'edit' && <EditPost id={route.id} />}
        </div>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <p className="site-footer__name">brian flounders &middot; philadelphia</p>
          <p className="site-footer__links">
            <a href="#" className="site-footer__email" onClick={(e) => { e.preventDefault(); window.location.href = 'mai' + 'lto:br' + 'ian@' + 'thefloun' + 'ders.com' }}>say hi</a>
            <span className="site-footer__sep">&middot;</span>
            <a href="https://primal.net/p/npub1a3v8gjqppmskcuvg4j23d9dapl8ylznrmy3kg90kemvkspu9cgxq4w7hf3" target="_blank" rel="noopener noreferrer">nostr</a>
            <span className="site-footer__sep">&middot;</span>
            <a href="/junto/">junto</a>
          </p>
          <p className="site-footer__tagline">built on nostr. no algorithms. own your attention.</p>
        </div>
      </footer>
    </>
  )
}
