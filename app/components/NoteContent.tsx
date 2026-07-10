'use client'

import type { ReactNode } from 'react'

const URL_PATTERN = /(https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+)/gi
const IMAGE_MD_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)\)/g

function normalizeHref(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

function trimTrailingPunctuation(url: string): { href: string; trailing: string } {
  const match = url.match(/^(.*?)([),.!?;:]+)$/)
  if (!match) return { href: url, trailing: '' }
  return { href: match[1], trailing: match[2] }
}

export function linkifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let key = 0
  const regex = new RegExp(URL_PATTERN.source, URL_PATTERN.flags)
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    const { href, trailing } = trimTrailingPunctuation(match[0])
    nodes.push(
      <a
        key={`a-${key++}`}
        href={normalizeHref(href)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-500 hover:text-brand-700 hover:underline break-all"
      >
        {href}
      </a>
    )
    if (trailing) nodes.push(trailing)
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : [text]
}

type ContentPart =
  | { type: 'text'; value: string }
  | { type: 'image'; src: string; alt: string }

export function parseContentParts(text: string): ContentPart[] {
  const parts: ContentPart[] = []
  const regex = new RegExp(IMAGE_MD_PATTERN.source, 'g')
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'image', alt: match[1] || '', src: match[2] })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return parts
}

export function extractContentImages(content: string): string[] {
  return parseContentParts(content)
    .filter((part): part is Extract<ContentPart, { type: 'image' }> => part.type === 'image')
    .map((part) => part.src)
}

export default function NoteContent({ text }: { text: string }) {
  if (!text) return null

  const parts = parseContentParts(text)
  if (parts.length === 0) return null

  return (
    <div className="note-content">
      {parts.map((part, index) => {
        if (part.type === 'image') {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`img-${index}`}
              src={part.src}
              alt={part.alt || ''}
              className="note-card-image note-content-image"
            />
          )
        }

        if (!part.value) return null
        return (
          <p key={`text-${index}`} className="note-content-text">
            {linkifyText(part.value)}
          </p>
        )
      })}
    </div>
  )
}
