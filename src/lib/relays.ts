// Brian's primary relay holds posts that aren't available on the public relays.
// Always include it, even when a deployment has an older VITE_RELAYS setting.
export const PRIMARY_RELAY = 'wss://premium.primal.net'

const FALLBACK_RELAYS = [
  'wss://relay.primal.net',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.snort.social',
]

export function relaysFromEnv(): string[] {
  const configured = ((import.meta.env.VITE_RELAYS as string | undefined) || '')
    .split(',').map(relay => relay.trim().replace(/\/+$/, '')).filter(Boolean)
  return [...new Set([PRIMARY_RELAY, ...(configured.length ? configured : FALLBACK_RELAYS)])]
}
