// Rule-based PII detectors: regular expressions plus checksum and context checks.
import type { CustomDetector, Library, PiiType, Span } from './types'
import { digitsOf, ibanValid, ipv4Valid, luhnValid, nhsValid, niValid } from './validators'

export interface RuleDetector {
  id: string
  label: string
  type: PiiType
  /** Base confidence for a match. */
  score: number
  pattern: RegExp
  /** Extra check on the match. Return false to reject, or a number to override the score. */
  validate?: (match: string, text: string, index: number) => boolean | number
  /** Which capture group is the PII (default: whole match). */
  group?: number
}

const MONTHS =
  'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?'

const before = (text: string, index: number, n: number): string =>
  text.slice(Math.max(0, index - n), index)

export const RULE_DETECTORS: RuleDetector[] = [
  {
    id: 'email',
    label: 'Email address',
    type: 'EMAIL',
    score: 0.99,
    pattern: /\b[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g
  },
  {
    id: 'url',
    label: 'Web address',
    type: 'URL',
    score: 0.9,
    pattern: /\bhttps?:\/\/[^\s<>"'()]+[^\s<>"'().,;:!?]/gi
  },
  {
    id: 'iban',
    label: 'IBAN',
    type: 'IBAN',
    score: 0.99,
    pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g,
    validate: (m) => ibanValid(m)
  },
  {
    id: 'card',
    label: 'Payment card number (Luhn checked)',
    type: 'CARD',
    score: 0.97,
    pattern: /\b(?:\d[ -]?){12,18}\d\b/g,
    validate: (m) => {
      const d = digitsOf(m)
      return d.length >= 13 && d.length <= 19 && luhnValid(d)
    }
  },
  {
    id: 'nhs-number',
    label: 'NHS number (mod-11 checked)',
    type: 'NHS_NUMBER',
    score: 0.9,
    pattern: /\b\d{3}[ -]?\d{3}[ -]?\d{4}\b/g,
    validate: (m, text, i) => {
      if (!nhsValid(m)) return false
      return /nhs/i.test(before(text, i, 40)) ? 0.99 : 0.9
    }
  },
  {
    id: 'ni-number',
    label: 'National Insurance number',
    type: 'NI_NUMBER',
    score: 0.97,
    pattern: /\b[A-Z]{2} ?\d{2} ?\d{2} ?\d{2} ?[A-D]\b/gi,
    validate: (m) => niValid(m)
  },
  {
    id: 'phone-uk',
    label: 'UK phone number',
    type: 'PHONE',
    score: 0.92,
    pattern: /(?<![\d+])(?:\+44\s?\(?0?\)?\s?|\(?0)\d{2,4}\)?(?:[\s-]?\d){6,8}(?!\d)/g,
    validate: (m) => {
      const d = digitsOf(m)
      if (d.startsWith('44')) return d.length === 12 || d.length === 13
      return d.length === 10 || d.length === 11
    }
  },
  {
    id: 'phone-intl',
    label: 'International phone number',
    type: 'PHONE',
    score: 0.85,
    pattern: /(?<![\w+])\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}(?!\d)/g,
    validate: (m) => {
      const n = digitsOf(m).length
      return n >= 8 && n <= 15
    }
  },
  {
    id: 'postcode-uk',
    label: 'UK postcode',
    type: 'POSTCODE',
    score: 0.95,
    pattern: /\b(?:GIR ?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]? ?\d[ABD-HJLNP-UW-Z]{2})\b/gi,
    validate: (m) => {
      // Lower-case postcodes are common, but "mixed case words" are not postcodes.
      if (m !== m.toUpperCase() && m !== m.toLowerCase()) return false
      return m === m.toUpperCase() ? 0.95 : 0.75
    }
  },
  {
    id: 'sort-code',
    label: 'Bank sort code',
    type: 'SORT_CODE',
    score: 0.8,
    pattern: /\b\d{2}-\d{2}-\d{2}\b/g,
    validate: (_m, text, i) => (/sort/i.test(before(text, i, 30)) ? 0.97 : 0.8)
  },
  {
    id: 'account-number',
    label: 'Bank account number (needs "account" nearby)',
    type: 'ACCOUNT_NUMBER',
    score: 0.9,
    pattern: /\b\d{8}\b/g,
    validate: (_m, text, i) => /\b(acc(?:oun)?t|a\/c)\b[^\n]{0,25}$/i.test(before(text, i, 40))
  },
  {
    id: 'ipv4',
    label: 'IPv4 address',
    type: 'IP',
    score: 0.95,
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    validate: (m) => ipv4Valid(m)
  },
  {
    id: 'ipv6',
    label: 'IPv6 address',
    type: 'IP',
    score: 0.9,
    pattern:
      /(?<![\w:])(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}(?![\w:])|(?<![\w:])(?:[A-Fa-f0-9]{1,4}:){1,6}:(?:[A-Fa-f0-9]{1,4}:?){1,6}(?![\w:])/g,
    validate: (m) => m.includes(':') && /[a-f0-9]{2}/i.test(m)
  },
  {
    id: 'date-iso',
    label: 'Date (ISO)',
    type: 'DATE',
    score: 0.7,
    pattern: /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g,
    validate: (_m, text, i) => (/(birth|dob|born)/i.test(before(text, i, 30)) ? 0.97 : 0.7)
  },
  {
    id: 'date-dmy',
    label: 'Date (dd/mm/yyyy)',
    type: 'DATE',
    score: 0.7,
    pattern: /\b(?:0?[1-9]|[12]\d|3[01])[/.-](?:0?[1-9]|1[0-2])[/.-](?:19|20)?\d{2}\b/g,
    validate: (_m, text, i) => (/(birth|dob|born)/i.test(before(text, i, 30)) ? 0.97 : 0.7)
  },
  {
    id: 'date-long',
    label: 'Date (12 March 1985)',
    type: 'DATE',
    score: 0.75,
    pattern: new RegExp(
      `\\b(?:0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)? (?:${MONTHS}),? (?:19|20)\\d{2}\\b`,
      'gi'
    ),
    validate: (_m, text, i) => (/(birth|dob|born)/i.test(before(text, i, 30)) ? 0.97 : 0.75)
  },
  {
    id: 'street-address',
    label: 'Street address (number + street)',
    type: 'ADDRESS',
    score: 0.85,
    pattern:
      /\b(?:(?:Flat|Apartment|Unit) \d+[A-Za-z]?,? )?\d{1,4}[A-Za-z]?,? (?:[A-Z][a-z']+ ){1,3}(?:Street|St|Road|Rd|Lane|Ln|Avenue|Ave|Close|Drive|Dr|Way|Gardens|Crescent|Cres|Place|Pl|Court|Ct|Terrace|Grove|Walk|Mews|Rise|View|Square|Sq|Hill|Park|Row|Green|Parade|Boulevard)\b\.?/g
  },
  {
    id: 'titled-name',
    label: 'Name after a title (Mr, Mrs, Dr...)',
    type: 'PERSON',
    score: 0.85,
    pattern:
      /\b(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Sir|Dame|Rev)\.? ((?:[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?)(?: [A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?){0,2})\b/g,
    group: 1
  }
]

function runRegex(
  text: string,
  det: Pick<RuleDetector, 'id' | 'type' | 'score' | 'pattern' | 'validate' | 'group'>,
  source: Span['source']
): Span[] {
  const out: Span[] = []
  const re = new RegExp(
    det.pattern.source,
    det.pattern.flags.includes('g') ? det.pattern.flags : det.pattern.flags + 'g'
  )
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m[0].length === 0) {
      re.lastIndex++
      continue
    }
    let start = m.index
    let value = m[0]
    if (det.group && m[det.group] !== undefined) {
      value = m[det.group]
      start = m.index + m[0].indexOf(value)
    }
    let score = det.score
    if (det.validate) {
      const v = det.validate(value, text, start)
      if (v === false) continue
      if (typeof v === 'number') score = v
    }
    out.push({
      start,
      end: start + value.length,
      type: det.type,
      text: value,
      score,
      source,
      detector: det.id
    })
  }
  return out
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function customDetectorSpans(text: string, detectors: CustomDetector[]): Span[] {
  const out: Span[] = []
  for (const d of detectors) {
    if (!d.enabled || !d.pattern) continue
    let pattern: RegExp
    try {
      pattern = new RegExp(d.pattern, d.flags.includes('g') ? d.flags : d.flags + 'g')
    } catch {
      continue
    }
    out.push(
      ...runRegex(text, { id: `custom:${d.id}`, type: d.type, score: 0.95, pattern }, 'rule')
    )
  }
  return out
}

function denyListSpans(text: string, terms: string[]): Span[] {
  const out: Span[] = []
  for (const term of terms) {
    const t = term.trim()
    if (!t) continue
    const re = new RegExp(`(?<![\\w])${escapeRe(t)}(?![\\w])`, 'gi')
    out.push(...runRegex(text, { id: 'deny-list', type: 'CUSTOM', score: 1, pattern: re }, 'deny'))
  }
  return out
}

/**
 * Dictionary name finder for when the ML model is off or missing: a known first name
 * followed by a capitalised word is very likely a person.
 */
function dictionaryNameSpans(text: string, library: Library): Span[] {
  const first = new Set(
    [...library.firstNames.female, ...library.firstNames.male].map((n) => n.toLowerCase())
  )
  const out: Span[] = []
  const re = /\b([A-Z][a-z]+)((?: [A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?){1,2})\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (!first.has(m[1].toLowerCase())) continue
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      type: 'PERSON',
      text: m[0],
      score: 0.7,
      source: 'dictionary',
      detector: 'name-dictionary'
    })
  }
  return out
}

/** Town names from the library (fallback for places when the ML model is off). */
function dictionaryTownSpans(text: string, library: Library): Span[] {
  const names = library.towns.map((t) => t.name).filter((n) => n.length > 2)
  if (names.length === 0) return []
  const re = new RegExp(
    `(?<![\\w-])(?:${names
      .map(escapeRe)
      .sort((a, b) => b.length - a.length)
      .join('|')})(?![\\w-])`,
    'g'
  )
  return runRegex(
    text,
    { id: 'town-dictionary', type: 'CITY', score: 0.6, pattern: re },
    'dictionary'
  )
}

export interface RuleOptions {
  library: Library
  /** Include dictionary-based name and town matching (used when the ML model is off). */
  dictionaryNames?: boolean
}

/** Run every rule detector over a text. Results may overlap; use mergeSpans afterwards. */
export function detectRules(text: string, opts: RuleOptions): Span[] {
  const spans: Span[] = []
  for (const det of RULE_DETECTORS) spans.push(...runRegex(text, det, 'rule'))
  spans.push(...customDetectorSpans(text, opts.library.customDetectors))
  spans.push(...denyListSpans(text, opts.library.denyList))
  if (opts.dictionaryNames !== false) {
    spans.push(...dictionaryNameSpans(text, opts.library))
    spans.push(...dictionaryTownSpans(text, opts.library))
  }
  return spans
}

const SOURCE_RANK: Record<Span['source'], number> = {
  user: 0,
  deny: 1,
  rule: 2,
  ner: 3,
  dictionary: 4
}

/**
 * Resolve overlapping spans. Priority: user > deny-list > rules > ML > dictionary, then
 * longer spans, then higher scores. Spans covering allow-listed terms are dropped.
 */
export function mergeSpans(spans: Span[], allowList: string[] = []): Span[] {
  const allow = new Set(allowList.map((s) => s.trim().toLowerCase()).filter(Boolean))
  const sorted = spans
    .filter((s) => !allow.has(s.text.trim().toLowerCase()))
    .sort(
      (a, b) =>
        SOURCE_RANK[a.source] - SOURCE_RANK[b.source] ||
        b.end - b.start - (a.end - a.start) ||
        b.score - a.score
    )
  const taken: Span[] = []
  for (const s of sorted) {
    if (taken.some((t) => s.start < t.end && t.start < s.end)) continue
    taken.push(s)
  }
  return taken.sort((a, b) => a.start - b.start)
}
