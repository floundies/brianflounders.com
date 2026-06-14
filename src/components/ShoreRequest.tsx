import * as React from 'react'

const ACCESS_WORD = 'wildwood'
const SHORE_ENDPOINT = import.meta.env.VITE_SHORE_ENDPOINT || ''
const SHORE_CALENDAR_EMBED_URL = import.meta.env.VITE_SHORE_CALENDAR_EMBED_URL || ''
const SHORE_PAGE_TITLE = 'Flounders Shore House Request Form'
const SHORE_PAGE_DESCRIPTION = 'Request dates for the Flounders family shore house in Wildwood Crest.'
const SHORE_PAGE_URL = 'https://www.brianflounders.com/shore'
const SHORE_PAGE_IMAGE = 'https://www.brianflounders.com/shore/images/share-card.jpg'
const SHORE_FAVICON = '/shore/sun-favicon.svg'

const units = [
  {
    id: 'one-bedroom',
    name: "Grammy's Flop House",
    details: '1 bedroom, 1 bath, queen pullout',
    sleeps: 'Sleeps 4-ish',
    dogs: 'No dogs',
  },
  {
    id: 'two-bedroom',
    name: "Papa's Upper Deck",
    details: '2 bedrooms, 1 bath, 3 queen beds',
    sleeps: 'Sleeps 6',
    dogs: 'No dogs',
  },
  {
    id: 'cottage',
    name: 'Cottage',
    details: '3 bedrooms, 4 queens, 2 bunk beds, 1 twin',
    sleeps: 'Big crew',
    dogs: 'Dogs allowed',
  },
]

const shoreImages = {
  hero: {
    src: '/shore/images/wildwood-crest-hero.png',
    alt: 'Generated Wildwood Crest inspired beach scene with dunes, ocean, umbrellas, and shore houses in warm late-day light',
  },
  chairs: {
    src: '/shore/images/beach-chairs.png',
    alt: 'Beach chairs and a striped umbrella set in the dunes facing the ocean',
  },
  boardwalk: {
    src: '/shore/images/wildwood-boardwalk-pier.png',
    alt: 'Generated Wildwood boardwalk inspired scene with amusement pier rides, beach, ocean, and pastel boardwalk details',
  },
}

type FormState = {
  name: string
  email: string
  phone: string
  unit: string
  arrival: string
  departure: string
  exclusive: string
  adults: string
  kids: string
  dogs: string
  notes: string
}

const emptyForm: FormState = {
  name: '',
  email: '',
  phone: '',
  unit: 'cottage',
  arrival: '',
  departure: '',
  exclusive: 'non-exclusive',
  adults: '',
  kids: '',
  dogs: '0',
  notes: '',
}

function getStoredAccess(): boolean {
  try {
    return window.localStorage.getItem('shore-access') === 'ok'
  } catch {
    return false
  }
}

function withCalendarRefresh(url: string, refreshKey: number): string {
  if (!url) return ''

  try {
    const parsed = new URL(url)
    parsed.searchParams.set('shoreRefresh', String(refreshKey))
    return parsed.toString()
  } catch {
    const joiner = url.includes('?') ? '&' : '?'
    return `${url}${joiner}shoreRefresh=${refreshKey}`
  }
}

function upsertMeta(selector: string, attributes: Record<string, string>): () => void {
  const existing = document.head.querySelector<HTMLMetaElement>(selector)
  const previous = existing
    ? Object.fromEntries(Array.from(existing.attributes).map((attribute) => [attribute.name, attribute.value]))
    : null
  const element = existing ?? document.createElement('meta')

  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value))
  if (!existing) document.head.appendChild(element)

  return () => {
    if (previous) {
      Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name))
      Object.entries(previous).forEach(([name, value]) => element.setAttribute(name, value))
    } else {
      element.remove()
    }
  }
}

function upsertLink(selector: string, attributes: Record<string, string>): () => void {
  const existing = document.head.querySelector<HTMLLinkElement>(selector)
  const previous = existing
    ? Object.fromEntries(Array.from(existing.attributes).map((attribute) => [attribute.name, attribute.value]))
    : null
  const element = existing ?? document.createElement('link')

  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value))
  if (!existing) document.head.appendChild(element)

  return () => {
    if (previous) {
      Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name))
      Object.entries(previous).forEach(([name, value]) => element.setAttribute(name, value))
    } else {
      element.remove()
    }
  }
}

export default function ShoreRequest() {
  const [unlocked, setUnlocked] = React.useState(getStoredAccess)
  const [word, setWord] = React.useState('')
  const [gateError, setGateError] = React.useState('')
  const [form, setForm] = React.useState<FormState>(emptyForm)
  const [status, setStatus] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [calendarRefreshKey, setCalendarRefreshKey] = React.useState(0)

  const calendarEmbedUrl = React.useMemo(
    () => withCalendarRefresh(SHORE_CALENDAR_EMBED_URL, calendarRefreshKey),
    [calendarRefreshKey]
  )

  React.useEffect(() => {
    const previousTitle = document.title
    document.title = SHORE_PAGE_TITLE

    const restore = [
      upsertMeta('meta[name="description"]', { name: 'description', content: SHORE_PAGE_DESCRIPTION }),
      upsertMeta('meta[name="robots"]', { name: 'robots', content: 'noindex,nofollow,noarchive' }),
      upsertMeta('meta[property="og:title"]', { property: 'og:title', content: SHORE_PAGE_TITLE }),
      upsertMeta('meta[property="og:description"]', { property: 'og:description', content: SHORE_PAGE_DESCRIPTION }),
      upsertMeta('meta[property="og:image"]', { property: 'og:image', content: SHORE_PAGE_IMAGE }),
      upsertMeta('meta[property="og:image:secure_url"]', { property: 'og:image:secure_url', content: SHORE_PAGE_IMAGE }),
      upsertMeta('meta[property="og:image:type"]', { property: 'og:image:type', content: 'image/jpeg' }),
      upsertMeta('meta[property="og:image:width"]', { property: 'og:image:width', content: '1200' }),
      upsertMeta('meta[property="og:image:height"]', { property: 'og:image:height', content: '630' }),
      upsertMeta('meta[property="og:url"]', { property: 'og:url', content: SHORE_PAGE_URL }),
      upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' }),
      upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' }),
      upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: SHORE_PAGE_TITLE }),
      upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: SHORE_PAGE_DESCRIPTION }),
      upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: SHORE_PAGE_IMAGE }),
      upsertLink('link[rel="icon"]', { rel: 'icon', href: SHORE_FAVICON, type: 'image/svg+xml' }),
    ]

    return () => {
      document.title = previousTitle
      restore.forEach((restoreMetadata) => restoreMetadata())
    }
  }, [])

  function unlock(event: React.FormEvent) {
    event.preventDefault()
    if (word.trim().toLowerCase() !== ACCESS_WORD) {
      setGateError('Try the shore word.')
      return
    }
    try {
      window.localStorage.setItem('shore-access', 'ok')
    } catch {
      // Local storage is just a convenience; the gate still works without it.
    }
    setUnlocked(true)
  }

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function submitRequest(event: React.FormEvent) {
    event.preventDefault()
    if (isSubmitting) return

    const dogCount = Number(form.dogs || 0)
    if (form.unit !== 'cottage' && dogCount > 0) {
      setStatus('Dogs are only allowed in the cottage. Pick the cottage or set dogs to 0.')
      return
    }

    if (!SHORE_ENDPOINT) {
      setStatus('The request form is ready, but it still needs the Google Apps Script endpoint before it can send.')
      return
    }

    setIsSubmitting(true)
    setStatus('Sending request...')

    try {
      const response = await fetch(SHORE_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(form),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      })
      const result = await response.json().catch(() => null)
      if (response.ok && result?.ok) {
        setForm(emptyForm)
        setCalendarRefreshKey(Date.now())
        setStatus('Request sent. Watch your email for confirmation.')
      } else {
        const message = result?.errors?.join(' ') || result?.error || 'Something went wrong sending this request.'
        setStatus(message)
      }
    } catch {
      setStatus('Could not reach the request system. Try again or text Brian.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!unlocked) {
    return (
      <main className="shore-gate">
        <section className="shore-gate__panel" aria-labelledby="shore-gate-title">
          <a className="shore-home-link" href="/">brianflounders.com</a>
          <p className="shore-kicker">Wildwood Crest</p>
          <h1 id="shore-gate-title">Shore house</h1>
          <p className="shore-gate__tagline">Family only. Vacancy by request.</p>
          <form onSubmit={unlock} className="shore-gate__form">
            <label htmlFor="shore-word">Family word</label>
            <div className="shore-gate__row">
              <input
                id="shore-word"
                type="password"
                value={word}
                onChange={(event) => setWord(event.target.value)}
                autoComplete="off"
                autoFocus
              />
              <button type="submit">Enter</button>
            </div>
            {gateError && <p className="shore-error">{gateError}</p>}
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="shore-page">
      <header className="shore-hero">
        <img className="shore-hero__image" src={shoreImages.hero.src} alt={shoreImages.hero.alt} />
        <div className="shore-hero__shade" />
        <div className="shore-hero__content">
          <a className="shore-home-link" href="/">brianflounders.com</a>
          <div>
            <p className="shore-kicker">Family &amp; friends request calendar</p>
            <h1>Wildwood Crest shore house</h1>
            <p className="shore-lede">
              Request a unit, note who is coming, and mark whether the stay is exclusive to that unit or open to the family.
            </p>
          </div>
        </div>
      </header>

      <section className="shore-units" aria-label="Units">
        {units.map((unit) => (
          <article className="shore-unit" key={unit.id}>
            <h2>{unit.name}</h2>
            <p>{unit.details}</p>
            <div className="shore-unit__meta">
              <span>{unit.sleeps}</span>
              <span>{unit.dogs}</span>
            </div>
          </article>
          ))}
      </section>

      <section className="shore-layout">
        <form className="shore-form" onSubmit={submitRequest}>
          <div className="shore-form__header">
            <p className="shore-kicker">New request</p>
            <h2>Save dates</h2>
          </div>

          <div className="shore-grid shore-grid--2">
            <label>
              Name
              <input required value={form.name} onChange={(event) => updateField('name', event.target.value)} />
            </label>
            <label>
              Email
              <input required type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} />
            </label>
          </div>

          <div className="shore-grid shore-grid--2">
            <label>
              Phone
              <input value={form.phone} onChange={(event) => updateField('phone', event.target.value)} />
            </label>
            <label>
              Unit
              <select value={form.unit} onChange={(event) => updateField('unit', event.target.value)}>
                {units.map((unit) => (
                  <option value={unit.id} key={unit.id}>{unit.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="shore-grid shore-grid--2">
            <label>
              Arrival
              <input required type="date" value={form.arrival} onChange={(event) => updateField('arrival', event.target.value)} />
            </label>
            <label>
              Departure
              <input required type="date" value={form.departure} onChange={(event) => updateField('departure', event.target.value)} />
            </label>
          </div>

          <fieldset className="shore-choice">
            <legend>Use of this unit</legend>
            <label>
              <input
                type="radio"
                name="exclusive"
                value="non-exclusive"
                checked={form.exclusive === 'non-exclusive'}
                onChange={(event) => updateField('exclusive', event.target.value)}
              />
              Non-exclusive
            </label>
            <label>
              <input
                type="radio"
                name="exclusive"
                value="exclusive"
                checked={form.exclusive === 'exclusive'}
                onChange={(event) => updateField('exclusive', event.target.value)}
              />
              Exclusive to this unit
            </label>
          </fieldset>

          <div className="shore-grid shore-grid--3">
            <label>
              Adults
              <input min="0" type="number" value={form.adults} onChange={(event) => updateField('adults', event.target.value)} />
            </label>
            <label>
              Kids
              <input min="0" type="number" value={form.kids} onChange={(event) => updateField('kids', event.target.value)} />
            </label>
            <label>
              Dogs
              <input min="0" max="4" type="number" value={form.dogs} onChange={(event) => updateField('dogs', event.target.value)} />
            </label>
          </div>

          <label>
            Notes
            <textarea rows={5} value={form.notes} onChange={(event) => updateField('notes', event.target.value)} />
          </label>

          <label className="shore-check">
            <input required type="checkbox" />
            This is a request and Brian will confirm it.
          </label>

          <button className="shore-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Sending...' : 'Send request'}
          </button>
          {status && <p className="shore-status">{status}</p>}
        </form>

        <aside className="shore-side">
          <section className="shore-calendar-shell">
            <div className="shore-calendar-shell__top">
              <p className="shore-kicker">Calendar</p>
              <h2>Everyone’s plans</h2>
            </div>
            {SHORE_CALENDAR_EMBED_URL ? (
              <iframe
                key={calendarRefreshKey}
                className="shore-calendar-frame"
                src={calendarEmbedUrl}
                title="Shore house shared Google Calendar"
              />
            ) : (
              <div className="shore-calendar-placeholder">
                Add VITE_SHORE_CALENDAR_EMBED_URL to show the shared Google Calendar here.
              </div>
            )}
          </section>

          <section className="shore-rules">
            <h2>House rules baked in</h2>
            <ul>
              <li>Exclusive means exclusive use of the selected unit only.</li>
              <li>Same-day departure and arrival are allowed.</li>
              <li>Dogs are only allowed in the cottage.</li>
              <li>More than two dogs can be approved by Brian.</li>
              <li>Pending requests should block the calendar right away.</li>
            </ul>
          </section>
        </aside>
      </section>

      <section className="shore-photo-band" aria-label="Shore house mood">
        <article className="shore-photo-card shore-photo-card--wide">
          <img src={shoreImages.boardwalk.src} alt={shoreImages.boardwalk.alt} />
          <div>
            <p className="shore-kicker">Doo Wop days</p>
            <h2>Boardwalk colors, beach-house rules.</h2>
            <p>Keep the calendar easy to scan, block dates while requests are pending, and let everyone see who is coming down.</p>
          </div>
        </article>
        <article className="shore-photo-card">
          <img src={shoreImages.chairs.src} alt={shoreImages.chairs.alt} />
          <div>
            <p className="shore-kicker">Beach notes</p>
            <h2>Save the dates, then Brian confirms.</h2>
          </div>
        </article>
      </section>
    </main>
  )
}
