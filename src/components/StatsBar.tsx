import { useEffect, useRef, useState } from 'react'

type Counts = {
  reactions: number
  reposts: number
  replies: number
  zaps: number
  msats: number | null
}

type Props = {
  ev: any
  lazy?: boolean   // lazy-load when visible (good for lists)
  compact?: boolean
}

const cache = new Map<string, Counts>()

let sharedPool: any = null
async function getPool() {
  if (sharedPool) return sharedPool
  const { SimplePool }: any = await import('https://esm.sh/nostr-tools@1.17.0')
  sharedPool = new SimplePool()
  return sharedPool
}

export default function StatsBar({ ev, lazy = false, compact = false }: Props) {
  const [counts, setCounts] = useState<Counts | null>(null)
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(!lazy)
  const ref = useRef<HTMLDivElement | null>(null)

  // Activate when item scrolls into view (if lazy)
  useEffect(() => {
    if (!lazy) return
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
  }, [lazy])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!active || !ev?.id) return

      // from cache?
      const cached = cache.get(ev.id)
      if (cached) {
        if (!cancelled) {
          setCounts(cached)
          setLoading(false)
        }
        return
      }

      try {
        setLoading(true)

        const pool = await getPool()
        const relays = (import.meta.env.VITE_RELAYS as string || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)

        // prefer NIP-33 address (#a) for 30023; fallback to #e
        const d = ev.tags?.find((t: string[]) => t[0] === 'd')?.[1]
        const addr = d ? `${ev.kind}:${ev.pubkey}:${d}` : null
        const refKey = addr ? '#a' : '#e'
        const refVal = addr ? [addr] : [ev.id]

        const [reactionEvs, repostEvs, replyEvs, zapEvs] = await Promise.all([
          pool.list(relays, [{ kinds: [7], [refKey]: refVal, limit: 1000 }]),
          pool.list(relays, [{ kinds: [6], [refKey]: refVal, limit: 1000 }]),
          pool.list(relays, [{ kinds: [1, 30023], [refKey]: refVal, limit: 1000 }]),
          pool.list(relays, [{ kinds: [9735], [refKey]: refVal, limit: 1000 }]),
        ])

        const uniq = (arr: any[]) => Array.from(new Map(arr.map(e => [e.id, e])).values())

        const reactions = uniq(reactionEvs).length
        const reposts = uniq(repostEvs).length
        const replies = uniq(replyEvs).length

        let zaps = 0
        let msats = 0
        for (const z of uniq(zapEvs)) {
          zaps += 1
          const amt = z.tags.find((t: string[]) => t[0] === 'amount')?.[1]
          if (amt) {
            const n = parseInt(amt, 10)
            if (!Number.isNaN(n)) msats += n
          }
        }

        const result: Counts = { reactions, reposts, replies, zaps, msats: msats || null }
        cache.set(ev.id, result)
        if (!cancelled) setCounts(result)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [active, ev?.id])

  const sats = counts?.msats != null ? Math.round(counts.msats / 1000) : null

  return (
    <div ref={ref} className="meta" style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: compact ? 4 : 8 }}>
      <span title="Reactions">👍 {counts?.reactions ?? 0}</span>
      <span title="Reposts">↻ {counts?.reposts ?? 0}</span>
      <span title="Replies">💬 {counts?.replies ?? 0}</span>
      <span title="Zaps">⚡ {counts?.zaps ?? 0}{sats != null ? ` (${sats} sats)` : ''}</span>
      {active && loading && <span>· updating…</span>}
    </div>
  )
}
