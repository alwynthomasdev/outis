// Turns raw token-classification output from the NER model into text spans.
// The model returns word pieces without character offsets, so we find each piece in the
// text in order. Kept pure so it can be unit tested without the model.
import type { PiiType, Span } from './types'

export interface NerToken {
  entity: string
  score: number
  index?: number
  word: string
}

const LABEL_TYPES: Record<string, PiiType> = {
  PER: 'PERSON',
  LOC: 'LOCATION',
  ORG: 'ORG',
  MISC: 'MISC'
}

interface Located extends NerToken {
  start: number
  end: number
  sub: boolean
}

/** Place each token in `text`, walking forwards. Tokens that can't be found are dropped. */
function locate(text: string, tokens: NerToken[]): Located[] {
  const out: Located[] = []
  let cursor = 0
  for (const t of tokens) {
    if (t.word === '[UNK]' || t.word === '[CLS]' || t.word === '[SEP]') continue
    const sub = t.word.startsWith('##')
    const piece = sub ? t.word.slice(2) : t.word
    if (!piece) continue
    const idx = text.indexOf(piece, cursor)
    if (idx === -1) continue
    // A subword must follow straight on from the previous piece.
    out.push({ ...t, start: idx, end: idx + piece.length, sub: sub && idx === cursor })
    cursor = idx + piece.length
  }
  return out
}

/**
 * Group B-/I- tagged pieces into entity spans.
 * @param offset added to all positions (for chunked text)
 */
export function tokensToSpans(text: string, tokens: NerToken[], offset = 0): Span[] {
  const located = locate(text, tokens)
  const spans: Span[] = []
  let cur: { type: PiiType; start: number; end: number; scores: number[] } | null = null

  const close = (): void => {
    if (!cur) return
    const value = text.slice(cur.start, cur.end)
    const trimmed = value.replace(/^[\s.,;:'"()-]+/, '').replace(/[\s.,;:'"()-]+$/, '')
    if (trimmed.length >= 2) {
      const start = cur.start + value.indexOf(trimmed)
      spans.push({
        start: start + offset,
        end: start + trimmed.length + offset,
        type: cur.type,
        text: trimmed,
        score: cur.scores.reduce((a, b) => a + b, 0) / cur.scores.length,
        source: 'ner',
        detector: 'ner'
      })
    }
    cur = null
  }

  for (const t of located) {
    const [prefix, label] = t.entity.includes('-') ? t.entity.split('-') : ['', t.entity]
    const type = LABEL_TYPES[label]

    // Word pieces always belong to the word they continue.
    if (t.sub && cur && t.start === cur.end) {
      cur.end = t.end
      if (type) cur.scores.push(t.score)
      continue
    }
    if (!type) {
      close()
      continue
    }
    const gap = cur ? text.slice(cur.end, t.start) : ''
    const continues =
      cur !== null && cur.type === type && prefix !== 'B' && /^[\s'-]{0,2}$/.test(gap)
    if (continues && cur) {
      cur.end = t.end
      cur.scores.push(t.score)
    } else {
      close()
      cur = { type, start: t.start, end: t.end, scores: [t.score] }
    }
  }
  close()
  return spans
}

/** Split text into chunks below the model's input size, breaking at sentence or line ends. */
export function chunkText(text: string, maxChars = 1000): { text: string; offset: number }[] {
  const chunks: { text: string; offset: number }[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars)
    if (end < text.length) {
      const window = text.slice(start, end)
      const breakAt = Math.max(
        window.lastIndexOf('\n'),
        window.lastIndexOf('. '),
        window.lastIndexOf('? '),
        window.lastIndexOf('! ')
      )
      if (breakAt > maxChars * 0.3) end = start + breakAt + 1
      else {
        const space = window.lastIndexOf(' ')
        if (space > maxChars * 0.3) end = start + space + 1
      }
    }
    chunks.push({ text: text.slice(start, end), offset: start })
    start = end
  }
  return chunks
}
