import { Fragment, type ReactNode } from 'react'

type TextSegment =
  | { type: 'text'; value: string }
  | { type: 'hashtag'; value: string; tag: string }
  | { type: 'url'; value: string }

const HASHTAG_REGEX = /(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_-]+)/gu
const URL_REGEX = /https?:\/\/[^\s<>'"]+/giu
const TRAILING_URL_PUNCTUATION = /[.,!?;:)\]}]+$/u

function textSegments(text: string): TextSegment[] {
  const urlMatches = Array.from(text.matchAll(URL_REGEX), match => {
    const value = match[0].replace(TRAILING_URL_PUNCTUATION, '')
    return {
      start: match.index,
      end: match.index + value.length,
      segment: { type: 'url', value } as TextSegment,
    }
  }).filter(match => match.end > match.start)

  const hashtagMatches = Array.from(text.matchAll(HASHTAG_REGEX)).filter(match => {
    const hashtagStart = match.index + match[1].length
    return !urlMatches.some(url => hashtagStart >= url.start && hashtagStart < url.end)
  }).map(match => {
    const start = match.index + match[1].length
    const value = `#${match[2]}`
    return {
      start,
      end: start + value.length,
      segment: { type: 'hashtag', value, tag: match[2] } as TextSegment,
    }
  })

  const matches = [...urlMatches, ...hashtagMatches].sort((a, b) => a.start - b.start)
  if (!matches.length) return [{ type: 'text', value: text }]

  const segments: TextSegment[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.start < cursor) continue
    if (match.start > cursor) segments.push({ type: 'text', value: text.slice(cursor, match.start) })
    segments.push(match.segment)
    cursor = match.end
  }
  if (cursor < text.length) segments.push({ type: 'text', value: text.slice(cursor) })
  return segments
}

function tagHref(tag: string): string {
  return `/#/tag/${encodeURIComponent(tag.toLowerCase())}`
}

export function HashtagText({ text }: { text: string }): ReactNode {
  return textSegments(text).map((segment, index) => {
    if (segment.type === 'hashtag') {
      return <a className="hashtag-link" href={tagHref(segment.tag)} key={`${segment.tag}-${index}`}>{segment.value}</a>
    }
    if (segment.type === 'url') {
      return <a className="auto-link" href={segment.value} target="_blank" rel="noopener noreferrer" key={`${segment.value}-${index}`}>{segment.value}</a>
    }
    return <Fragment key={index}>{segment.value}</Fragment>
  })
}

export function linkifyHashtagsInHtml(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const parent = node.parentElement
    if (!parent || parent.closest('a, code, pre, script, style, textarea')) continue
    if (textSegments(node.data).some(segment => segment.type !== 'text')) textNodes.push(node)
  }

  for (const node of textNodes) {
    const fragment = document.createDocumentFragment()
    for (const segment of textSegments(node.data)) {
      if (segment.type === 'text') {
        fragment.appendChild(document.createTextNode(segment.value))
      } else if (segment.type === 'hashtag') {
        const link = document.createElement('a')
        link.className = 'hashtag-link'
        link.href = tagHref(segment.tag)
        link.textContent = segment.value
        fragment.appendChild(link)
      } else {
        const link = document.createElement('a')
        link.className = 'auto-link'
        link.href = segment.value
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.textContent = segment.value
        fragment.appendChild(link)
      }
    }
    node.replaceWith(fragment)
  }

  return template.innerHTML
}
