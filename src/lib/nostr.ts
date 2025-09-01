import NDK, { NDKEvent, NDKNip07Signer, NDKUser } from '@nostr-dev-kit/ndk'

export const relays = (import.meta.env.VITE_RELAYS as string | undefined)?.split(',').map(s=>s.trim()).filter(Boolean) ?? [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.band'
]

export function resolveAuthor(): string | null {
  const url = new URL(window.location.href)
  const q = url.searchParams.get('pub')
  if (q) return q
  const env = import.meta.env.VITE_NOSTR_AUTHOR as string | undefined
  return env ?? null
}

export const ndk = new NDK({ explicitRelayUrls: relays })

export async function connectNDK(){ await ndk.connect() }

export async function getUser(pubOrNpub: string): Promise<NDKUser> {
  const u = await ndk.getUser({ npub: pubOrNpub.startsWith('npub') ? pubOrNpub : undefined, pubkey: pubOrNpub.startsWith('npub') ? undefined : pubOrNpub })
  return u
}

export async function listPosts(authorHex: string){
  const events = await ndk.fetchEvents({ kinds: [30023], authors: [authorHex] })
  return Array.from(events).sort((a,b)=> (b.created_at||0) - (a.created_at||0))
}

export function titleFrom(ev: NDKEvent){
  const t = ev.tags.find(t=>t[0]==='title')?.[1]
  if (t) return t
  const first = (ev.content||'').split('\n')[0]
  return first.replace(/^#\s*/, '') || 'Untitled'
}

export function summaryFrom(ev: NDKEvent){
  return ev.tags.find(t=>t[0]==='summary')?.[1] || ''
}

export function dTagFrom(ev: NDKEvent){
  return ev.tags.find(t=>t[0]==='d')?.[1]
}

export async function publishPost(title: string, summary: string, md: string, dExisting?: string){
  if (!(window as any).nostr) throw new Error('No NIP-07 extension found')
  const signer = new NDKNip07Signer()
  ndk.signer = signer
  const user = await signer.user()
  const now = Math.floor(Date.now()/1000)
  const d = dExisting ?? `${now}-${Math.random().toString(36).slice(2,8)}`

  const ev = new NDKEvent(ndk)
  ev.kind = 30023
  ev.created_at = now
  ev.content = md
  ev.tags = [
    ['title', title],
    ['summary', summary],
    ['d', d],
  ]
  ev.pubkey = user.pubkey
  await ev.sign()
  await ev.publish()     // relays that follow NIP-33 will now show this as the latest
  return ev
}
