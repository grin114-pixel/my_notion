'use client'

import type { ReactNode } from 'react'

const URL_PATTERN = /(https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+)/gi

function normalizeHref(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

function trimTrailingPunctuation(url: string): { href: string; trailing: string } {
  const match = url.match(/^(.*?)([),.!?;:]+)$/)
  if (!match) return { href: url, trailing: '' }
  return { href: match[1], trailing: match[2] }
}

export default function LinkifiedText({ text }: { text: string }) {
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
        key={key++}
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

  return <p>{nodes.length > 0 ? nodes : text}</p>
}
