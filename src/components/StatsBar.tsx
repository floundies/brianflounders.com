// src/components/StatsBar.tsx
import { useEffect, useMemo, useRef, useState } from 'react'

type Props = {
  ev: any
  compact?: boolean
  lazy?: boolean
  interactive?: boolean
}

function relaysFromEnv() {
  const s = (import.meta.env.VITE_RELAYS as string) || ''
  const arr = s.split(',').map(t => t.trim()).filter(Boolean)
  return arr.length ? arr : [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social',
  ]
}

function addressOf(ev: any): string | null {
  if (ev?.kind === 30023) {
    const d = (ev.tags || []).find((t: string[]) => t[0] === 'd')?.[1]
    if (d) return `${ev.kind}:${ev.pubkey}:${d}`
  }
  return null
}

function uniq<T extends { id: string }>(xs: T[]) {
  const seen = new Set<string>()
  return xs.filter(x => (seen.has(x.id) ? false : (seen.add(x.id), true)))
}

export default function StatsBar({ ev, compact, lazy, interactive }: Props) {
  const [counts, setCounts] = useState({ likes: 0, boosts: 0, replies: 0, zaps: 0 })
  const [mine, setMine] = useState({ liked: false, boosted: false })
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const loadedRef = useRef(false)

  const aTag = useMemo(() => addressOf(ev), [ev?.id])

  // load counts
  useEffect(() => {
    loadedRef.current = false
    setCounts({ likes: 0, boosts: 0, replies: 0, zaps: 0 })
    setMine({ liked: false, boosted: false })

    const el = anchorRef.current
    if (!el) return

    const run = () => {
      if (loadedRef.current) return
      loadedRef.current = true
      ;(async () => {
        try {
          const { SimplePool }: any = await import('https://esm.sh/nostr-tools@1.17.0')
          const pool = new SimplePool()
          const relays = relaysFromEnv()

          const filters: any[] = [
            { kinds: [7],    '#e': [ev.id], limit: 500 }, // likes
            { kinds: [6],    '#e': [ev.id], limit: 500 }, // reposts
            { kinds: [1],    '#e': [ev.id], limit: 500 }, // replies
            { kinds: [9735], '#e': [ev.id], limit: 500 }, // zaps
          ]
          if (aTag) filters.push({ kinds: [7,6,1,9735], '#a': [aTag], limit: 500 })

          const res = await pool.list(relays, filters)
          const events = uniq(res)

          setCounts({
            likes:   events.filter(e => e.kind === 7).length,
            boosts:  events.filter(e => e.kind === 6).length,
            replies: events.filter(e => e.kind === 1).length,
            zaps:    events.filter(e => e.kind === 9735).length,
          })

          const ext = (window as any).nostr
          if (ext?.getPublicKey) {
            try {
              const me = await ext.getPublicKey()
              setMine({
                liked:   events.some(e => e.kind === 7 && e.pubkey === me),
                boosted: events.some(e => e.kind === 6 && e.pubkey === me),
              })
            } catch {}
          }
        } catch {}
      })()
    }

    if (!lazy) { run(); return }
    const io = new IntersectionObserver(
      (ents) => { if (ents[0]?.isIntersecting) run() },
      { rootMargin: '300px' }
    )
    io.observe(el); return () => io.disconnect()
  }, [ev?.id, aTag, lazy])

  // --- actions ---------------------------------------------------------------
  async function publishLike() {
    try {
      const ext = (window as any).nostr
      if (!ext?.signEvent) return alert('Enable a Nostr signer (e.g., Alby) to like.')
      const { SimplePool }: any = await import('https://esm.sh/nostr-tools@1.17.0')
      const pool = new SimplePool()
      const relays = relaysFromEnv()
      const tags: string[][] = [['e', ev.id], ['p', ev.pubkey]]
      if (aTag) tags.push(['a', aTag])
      const unsigned = { kind: 7, created_at: Math.floor(Date.now()/1000), tags, content: '+', pubkey: '' }
      const signed = await ext.signEvent(unsigned)
      await pool.publish(relays, signed)
      setCounts(c => ({ ...c, likes: c.likes + 1 }))
      setMine(m => ({ ...m, liked: true }))
    } catch (e:any) { alert(e?.message || 'Could not like') }
  }

  async function publishBoost() {
    try {
      const ext = (window as any).nostr
      if (!ext?.signEvent) return alert('Enable a Nostr signer (e.g., Alby) to repost.')
      const { SimplePool }: any = await import('https://esm.sh/nostr-tools@1.17.0')
      const pool = new SimplePool()
      const relays = relaysFromEnv()
      const tags: string[][] = [['e', ev.id], ['p', ev.pubkey]]
      if (aTag) tags.push(['a', aTag])
      const unsigned = { kind: 6, created_at: Math.floor(Date.now()/1000), tags, content: '', pubkey: '' }
      const signed = await ext.signEvent(unsigned)
      await pool.publish(relays, signed)
      setCounts(c => ({ ...c, boosts: c.boosts + 1 }))
      setMine(m => ({ ...m, boosted: true }))
    } catch (e:any) { alert(e?.message || 'Could not repost') }
  }

  function goReply() {
    try { sessionStorage.setItem('goto_comments', '1') } catch {}
    window.location.hash = `#/post/${ev.id}` // opens post page with comments block
  }

  // NIP-57 zap (LNURLp via author lud16 or fallback env address)
  async function zapPrompt() {
    const def = 21
    const sats = Number(prompt('Zap amount (sats):', String(def)))
    if (!sats || sats <= 0) return
    try {
      const { SimplePool }: any = await import('https://esm.sh/nostr-tools@1.17.0')
      const pool = new SimplePool()
      const relays = relaysFromEnv()

      // fetch author's lud16
      let address: string | undefined
      try {
        const meta = await pool.get(relays, { kinds: [0], authors: [ev.pubkey] })
        if (meta?.content) {
          const j = JSON.parse(meta.content)
          address = j?.lud16 || j?.lud06
        }
      } catch {}
      if (!address) address = import.meta.env.VITE_LIGHTNING_ADDRESS as string | undefined
      if (!address || !address.includes('@')) {
        alert('The author has no Lightning address (lud16).'); return
      }

      const [name, domain] = address.split('@')
      const payUrl = `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`

      // Build zap request (kind 9734)
      const ext = (window as any).nostr
      if (!ext?.signEvent) return alert('Enable a Nostr signer (e.g., Alby) to zap.')
      const tags: string[][] = [['p', ev.pubkey], ['relays', ...relays.slice(0,5)]]
      if (aTag) tags.push(['a', aTag]); else tags.push(['e', ev.id])
      const zr = await ext.signEvent({
        kind: 9734, created_at: Math.floor(Date.now()/1000),
        tags, content: '', pubkey: ''
      })

      const amountMsat = String(sats * 1000)
      const lnurlRes = await fetch(`${payUrl}?amount=${amountMsat}&nostr=${encodeURIComponent(JSON.stringify(zr))}`)
      if (!lnurlRes.ok) throw new Error('LNURL pay endpoint error')
      const data = await lnurlRes.json()
      const invoice = data?.pr
      if (!invoice) throw new Error('No invoice returned')

      const webln = (window as any).webln
      try {
        await webln?.enable?.()
        await webln?.sendPayment?.(invoice)
      } catch {
        try { navigator.clipboard?.writeText(invoice) } catch {}
        window.location.href = `lightning:${invoice}`
      }
    } catch (e:any) {
      alert(e?.message || 'Could not zap')
    }
  }

  const Action = ({
    title,
    icon,
    count,
    onClick,
    dim,
  }: {
    title: string
    icon: string
    count: number
    onClick?: () => void
    dim?: boolean
  }) => (
    <button
      type="button"
      className="action"
      title={title}
      onClick={interactive && onClick ? onClick : undefined}
      disabled={interactive ? !onClick : true}
      style={{
        opacity: dim ? 0.6 : 1,
        fontSize: compact ? '0.95rem' : '1rem',
        background: 'transparent',
        border: 'none',
        color: 'inherit',           // inherit dark-mode palette
      }}
    >
      <span className="icon" aria-hidden="true">{icon}</span>
      <span className="count">{count}</span>
    </button>
  )

  return (
    <div ref={anchorRef} className="stats" aria-label="Post actions">
      <Action
        title={mine.liked ? 'You liked this' : 'Like'}
        icon="👍"
        count={counts.likes}
        onClick={!mine.liked ? publishLike : undefined}
        dim={mine.liked}
      />
      <Action
        title={mine.boosted ? 'You reposted this' : 'Repost'}
        icon="↻"
        count={counts.boosts}
        onClick={!mine.boosted ? publishBoost : undefined}
        dim={mine.boosted}
      />
      <Action
        title="Reply"
        icon="💬"
        count={counts.replies}
        onClick={goReply}
      />
      <Action
        title="Zap"
        icon="⚡"
        count={counts.zaps}
        onClick={zapPrompt}
      />
    </div>
  )
}
