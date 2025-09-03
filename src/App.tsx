import { useEffect, useState } from 'react'
import PostList from './components/PostList'
import PostView from './components/PostView'
import NewPost from './components/NewPost'
import EditPost from './components/EditPost'

type Route =
  | { name: 'home' }
  | { name: 'post'; id: string }
  | { name: 'new' }
  | { name: 'edit'; id: string }

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
  return { name: 'home' }
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash())

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <>
      {/* Sticky header */}
      <header className="site">
        <div className="wrap nav">
          <div className="brand">
            <a href="#/">brianflounders.com</a>
          </div>
          <nav className="nav-links">
            <a href="#/">Home</a>
            <a href="#/new">New Post</a>
          </nav>
        </div>
      </header>

      {/* Page */}
      <main className="page">
        <div className="wrap">
          {route.name === 'home' && <PostList />}
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
