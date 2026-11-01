import { applyAction } from './actions'
import type { Mapper } from './mapper'
import type { Replacement, Span, TextOptions, TextResult } from './types'

/** Replace the given spans in a text. Spans must not overlap (use mergeSpans first). */
export function anonymiseText(
  text: string,
  spans: Span[],
  mapper: Mapper,
  action: TextOptions['action'] = 'fake'
): TextResult {
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  let out = ''
  let pos = 0
  const replacements: Replacement[] = []
  for (const s of sorted) {
    if (s.start < pos) continue
    out += text.slice(pos, s.start)
    const before = text.slice(s.start, s.end)
    const after = applyAction(before, { action, type: s.type, maskKeep: 2 }, mapper)
    replacements.push({
      start: s.start,
      end: s.end,
      outStart: out.length,
      outEnd: out.length + after.length,
      before,
      after,
      type: s.type
    })
    out += after
    pos = s.end
  }
  out += text.slice(pos)
  return { output: out, replacements }
}
