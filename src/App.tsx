import { useEffect, useState } from 'react'
import PostList from './components/PostList'
import PostView from './components/PostView'
import NewPost from './components/NewPost'
import EditPost from './components/EditPost'

type Route =
  | { view: 'list' }
  | { view: 'new' }
  | { view: 'post'; id: string }
  | { view: 'edit'; id: string }

function useRoute(): Route {
  const [route, setRoute] = useState(window.location.hash || '#/')

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash || '#/')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const mPost = route.match(/^#\/post\/(.+)$/)
  if (mPost) return { view: 'post', id: mPost[1] }

  const mEdit = route.match(/^#\/edit\/(.+)$/)
  if (mEdit) return { view: 'edit', id: mEdit[1] }

  if (route.startsWith('#/new')) return { view: 'new' }

  return { view: 'list' }
}

const lightning = import.meta.env.VITE_LIGHTNING_ADDRESS as string | undefined

function ZapButton() {
  if (!lightning) return null
  async function zap() {
    const webln = (window as any).webln
    if (webln && webln.sendPayment) {
      try {
        await webln.enable?.()
        await webln.sendPayment(lightning)
        return
      } catch {
        // fall through to lightning: link
      }
    }
    window.location.href = `lightning:${lightning}`
  }
  return <button className="btn" onClick={zap}>⚡ Zap</button>
}

export default function App() {
  const r = useRoute()

  // Author from ?pub=npub... or .env fallback
  const url = new URL(window.location.href)
  const author =
    url.searchParams.get('pub') ||
    ((import.meta.env.VITE_NOSTR_AUTHOR as string) || '')

  return (
    <div>
      <header>
        <div className="wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0 }}>brianflounders.com</h1>
            <div className="meta">Author: {author || '— set VITE_NOSTR_AUTHOR or pass ?pub='}</div>
          </div>
          <nav style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <a href="#/">Home</a>
            <a href="#/new">New Post</a>
            <ZapButton />
          </nav>
        </div>
      </header>

      <main className="wrap">
        {r.view === 'list' && <PostList author={author} />}
        {r.view === 'post' && <PostView id={r.id} />}
        {r.view === 'new' && <NewPost />}
        {r.view === 'edit' && <EditPost id={r.id} />}
      </main>

      <footer className="wrap" style={{ opacity: 0.7, fontSize: '.9rem', paddingBottom: 30 }}>
        Powered by Nostr (NIP-23). No servers. Deploy anywhere.
      </footer>
    </div>
  )
}
