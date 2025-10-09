import { useEffect, useRef, useState } from 'react'
import { titleFrom, summaryFrom } from '../lib/nostr'


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
function nameFromProfile(profile: any, pubkey: string) {
  const p = profile || {}
  return (
    p.display_name ||
    p.name ||
    (p.nip05 ? String(p.nip05).split('@')[0] : '') ||
    (pubkey ? `${pubkey.slice(0, 8)}…${pubkey.slice(-4)}` : 'unknown')
  )
}
function possessive(name: string) {
  return name.endsWith('s') ? `${name}’` : `${name}’s`
}

type Props = { ev: any } // kind 6

export default function RepostCard({ ev }: Props) {
  const [orig, setOrig] = useState<any | null>(null)
  const [profile, setProfile] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string>('')

  const ref = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState(false)

  // lazy activate
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setActive(true)
          io.disconnect()
        }
      },
      { rootMargin: '200px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!active) return
      let tempPool: any = null
      try {
        setLoading(true); setErr('')

        // embedded original?
        let original: any = null
        if (ev.content && ev.content.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(ev.content)
            if (parsed?.id && parsed?.pubkey) original = parsed
          } catch {}
        }

        const relaysEnv = (import.meta.env.VITE_RELAYS as string) || ''
        let relays = relaysEnv.split(',').map(s => s.trim()).filter(Boolean)
        if (!relays.length) {
          relays = [
            'wss://relay.primal.net',
            'wss://relay.damus.io',
            'wss://nos.lol',
            'wss://relay.snort.social',
          ]
        }
        const { SimplePool }: any = await import('https://esm.sh/nostr-tools@1.17.0')
        const p = new SimplePool()
        tempPool = p

        // resolve via tags if needed
        if (!original) {
          const aTag = (ev.tags || []).find((t: string[]) => t[0] === 'a')?.[1]
          const eTag = (ev.tags || []).find((t: string[]) => t[0] === 'e')?.[1]
          let filter: any = null
          if (aTag) {
            const [kStr, pub, d] = aTag.split(':')
            const k = parseInt(kStr, 10)
            filter = d ? { kinds: [k], authors: [pub], '#d': [d] } : { kinds: [k], authors: [pub] }
          } else if (eTag) {
            filter = { ids: [eTag] }
          }
          if (filter) original = await p.get(relays, filter)
        }

        if (!original) {
          if (!cancelled) { setOrig(null); setErr('original not found') }
          return
        }

        if (cancelled) return
        setOrig(original)

        // fetch original author's profile (kind 0)
        try {
          const profEv = (await p.list(relays, [{ kinds: [0], authors: [original.pubkey], limit: 1 }]))?.[0]
          const prof = profEv?.content ? JSON.parse(profEv.content) : null
          if (!cancelled) setProfile(prof)
        } catch {}
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e))
      } finally {
        try { tempPool && tempPool.close(relays) } catch {}
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [active, ev?.id])

  const repostTs = new Date((ev.created_at || 0) * 1000).toISOString().slice(0, 16).replace('T', ' ')
  const origName = nameFromProfile(profile, orig?.pubkey || '')
  const who = orig ? `${possessive(origName)} post` : 'a post'

  return (
    <div ref={ref}>
      <div className="meta">
        <em>{repostTs}</em> · ↻ reposted <strong>{who}</strong>
      </div>

      {orig ? (
        <>
          {orig.kind === 1 && (
            <div style={{ marginTop: 6 }}>
              {stripImageUrls(orig.content || '') && (
                <div style={{ whiteSpace: 'pre-wrap' }}>{stripImageUrls(orig.content || '')}</div>
              )}
              {imageUrlsFrom(orig.content || '').map((u, i) => (
                <img key={i} src={u} alt="" style={{ maxWidth: '100%', borderRadius: 8, marginTop: 8 }} />
              ))}
            </div>
          )}

          {orig.kind === 30023 && (
            <div style={{ marginTop: 6 }}>
              <a className="post-title" href={`#/post/${orig.id}`}>{titleFrom(orig)}</a>
              <div className="meta">{summaryFrom(orig) || ''}</div>
            </div>
          )}

          {!([1, 30023].includes(orig.kind)) && (
            <div style={{ marginTop: 6 }}>
              <a className="post-title" href={`#/post/${orig.id}`}>Open original</a>
            </div>
          )}
        </>
      ) : (
        <>
          {loading ? (
            <div className="meta">loading original…</div>
          ) : (
            err && <div className="meta">error loading original: {err}</div>
          )}
        </>
      )}
    </div>
  )
}
