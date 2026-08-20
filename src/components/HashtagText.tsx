import { Fragment, type ReactNode } from 'react'

type TextSegment =
  | { type: 'text'; value: string }
  | { type: 'hashtag'; value: string; tag: string }

const HASHTAG_REGEX = /(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_-]+)/gu
const URL_REGEX = /https?:\/\/[^\s<>'"()]+/giu

function hashtagSegments(text: string): TextSegment[] {
  const urlRanges = Array.from(text.matchAll(URL_REGEX), match => ({
    start: match.index,
    end: match.index + match[0].length,
  }))
  const matches = Array.from(text.matchAll(HASHTAG_REGEX)).filter(match => {
    const hashtagStart = match.index + match[1].length
    return !urlRanges.some(range => hashtagStart >= range.start && hashtagStart < range.end)
  })

  if (!matches.length) return [{ type: 'text', value: text }]

  const segments: TextSegment[] = []
  let cursor = 0
  for (const match of matches) {
    const hashtagStart = match.index + match[1].length
    if (hashtagStart > cursor) segments.push({ type: 'text', value: text.slice(cursor, hashtagStart) })
    const value = `#${match[2]}`
    segments.push({ type: 'hashtag', value, tag: match[2] })
    cursor = hashtagStart + value.length
  }
  if (cursor < text.length) segments.push({ type: 'text', value: text.slice(cursor) })
  return segments
}

function tagHref(tag: string): string {
  return `/#/tag/${encodeURIComponent(tag.toLowerCase())}`
}

export function HashtagText({ text }: { text: string }): ReactNode {
  return hashtagSegments(text).map((segment, index) => (
    segment.type === 'hashtag'
      ? <a className="hashtag-link" href={tagHref(segment.tag)} key={`${segment.tag}-${index}`}>{segment.value}</a>
      : <Fragment key={index}>{segment.value}</Fragment>
  ))
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
    if (hashtagSegments(node.data).some(segment => segment.type === 'hashtag')) textNodes.push(node)
  }

  for (const node of textNodes) {
    const fragment = document.createDocumentFragment()
    for (const segment of hashtagSegments(node.data)) {
      if (segment.type === 'text') {
        fragment.appendChild(document.createTextNode(segment.value))
      } else {
        const link = document.createElement('a')
        link.className = 'hashtag-link'
        link.href = tagHref(segment.tag)
        link.textContent = segment.value
        fragment.appendChild(link)
      }
    }
    node.replaceWith(fragment)
  }

  return template.innerHTML
}
