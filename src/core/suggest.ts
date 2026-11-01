// Looks at column names and sample values and suggests a rule for each field.
import { RULE_DETECTORS } from './detectors'
import { collectLeaves } from './paths'
import type { FieldProfile, JsonData, Library, PiiType, Suggestion, TableData } from './types'

const SAMPLE_SIZE = 200

const NAME_HINTS: [RegExp, PiiType | 'scan'][] = [
  [/e-?mail/i, 'EMAIL'],
  [/(first|given|fore)[ _-]?name|^fname$|^first$/i, 'FIRST_NAME'],
  [/(last|sur|family)[ _-]?name|^lname$|^surname$|^last$/i, 'LAST_NAME'],
  [
    /(^|[ _-])(full[ _-]?|customer[ _-]?|contact[ _-]?|patient[ _-]?|client[ _-]?|display[ _-]?)?name$|^name$/i,
    'PERSON'
  ],
  [/user[ _-]?name|login|handle/i, 'USERNAME'],
  [/phone|mobile|tel(ephone)?$|^tel|fax|contact[ _-]?number/i, 'PHONE'],
  [/post[ _-]?code|zip/i, 'POSTCODE'],
  [/address|street|addr|line[ _-]?[12]/i, 'ADDRESS'],
  [/city|town/i, 'CITY'],
  [/county|region|country|location|place/i, 'LOCATION'],
  [/national[ _-]?insurance|ni[ _-]?(no|num)|^nino$/i, 'NI_NUMBER'],
  [/nhs/i, 'NHS_NUMBER'],
  [/card[ _-]?(no|num)|pan$|credit[ _-]?card/i, 'CARD'],
  [/iban/i, 'IBAN'],
  [/sort[ _-]?code/i, 'SORT_CODE'],
  [/account[ _-]?(no|num)|acc[ _-]?no/i, 'ACCOUNT_NUMBER'],
  [/(^|[ _-])ip([ _-]?addr(ess)?)?$|ip[ _-]?address/i, 'IP'],
  [/url|website|link/i, 'URL'],
  [/dob|birth|born/i, 'DATE'],
  [/company|employer|organi[sz]ation|^org$|business/i, 'ORG'],
  [/note|comment|description|message|bio|remarks|summary|body|feedback|text$/i, 'scan']
]

function fromName(field: string): Suggestion | null {
  const leaf =
    field
      .replace(/\[\*\]/g, '')
      .split(/[.[\]"]+/)
      .filter(Boolean)
      .pop() ?? field
  for (const [re, type] of NAME_HINTS) {
    if (!re.test(leaf)) continue
    if (type === 'scan')
      return {
        action: 'scan',
        type: 'GENERIC',
        confidence: 0.6,
        reason: `Name "${leaf}" suggests free text`
      }
    return {
      action: 'fake',
      type,
      confidence: 0.7,
      reason: `Name "${leaf}" looks like ${type.toLowerCase().replace('_', ' ')}`
    }
  }
  return null
}

function fromValues(samples: string[], lib: Library): Suggestion | null {
  const values = samples.filter((s) => s.trim())
  if (values.length === 0) return null

  // Whole-value detector matches
  let best: { type: PiiType; hits: number } | null = null
  for (const det of RULE_DETECTORS) {
    if (det.type === 'PERSON') continue
    let hits = 0
    for (const v of values) {
      const re = new RegExp(det.pattern.source, det.pattern.flags.replace('g', ''))
      const m = re.exec(v.trim())
      if (!m || m[0].length < v.trim().length * 0.9) continue
      if (det.validate && det.validate(m[0], v, m.index) === false) continue
      hits++
    }
    if (hits > 0 && (!best || hits > best.hits)) best = { type: det.type, hits }
  }
  if (best && best.hits / values.length >= 0.6) {
    return {
      action: 'fake',
      type: best.type,
      confidence: Math.min(0.99, best.hits / values.length),
      reason: `${Math.round((best.hits / values.length) * 100)}% of samples match ${best.type.toLowerCase().replace('_', ' ')}`
    }
  }

  // Names from the library
  const first = new Set(
    [...lib.firstNames.female, ...lib.firstNames.male].map((n) => n.toLowerCase())
  )
  const last = new Set(lib.lastNames.map((n) => n.toLowerCase()))
  let firstHits = 0
  let lastHits = 0
  let fullHits = 0
  for (const v of values) {
    const words = v.trim().split(/\s+/)
    if (words.length === 1) {
      if (first.has(words[0].toLowerCase())) firstHits++
      if (last.has(words[0].toLowerCase())) lastHits++
    } else if (
      words.length <= 4 &&
      first.has(words[0].toLowerCase()) &&
      /^\p{Lu}/u.test(words[words.length - 1])
    )
      fullHits++
  }
  const n = values.length
  if (fullHits / n >= 0.3)
    return {
      action: 'fake',
      type: 'PERSON',
      confidence: 0.8,
      reason: 'Values look like full names'
    }
  if (firstHits / n >= 0.3 && firstHits >= lastHits)
    return {
      action: 'fake',
      type: 'FIRST_NAME',
      confidence: 0.75,
      reason: 'Values are known first names'
    }
  if (lastHits / n >= 0.3)
    return {
      action: 'fake',
      type: 'LAST_NAME',
      confidence: 0.7,
      reason: 'Values are known surnames'
    }

  // Long free text
  const avgLen = values.reduce((a, v) => a + v.length, 0) / n
  const wordy = values.filter((v) => v.trim().split(/\s+/).length >= 5).length / n
  if (avgLen > 30 && wordy > 0.5)
    return {
      action: 'scan',
      type: 'GENERIC',
      confidence: 0.6,
      reason: 'Long free text: scan for PII inside it'
    }
  return null
}

export function suggestField(field: string, samples: string[], lib: Library): Suggestion | null {
  const byValue = fromValues(samples, lib)
  const byName = fromName(field)
  if (byValue && byName && byValue.type === byName.type)
    return {
      ...byValue,
      confidence: Math.min(0.99, byValue.confidence + 0.1),
      reason: `${byValue.reason}; column name agrees`
    }
  if (byValue && byValue.confidence >= 0.8) return byValue
  // A name hint like "notes" should beat a weak value guess, and vice versa.
  return byName ?? byValue
}

export function profileTable(t: TableData, lib: Library): FieldProfile[] {
  return t.columns.map((field, col) => {
    const values = t.rows.map((r) => r[col] ?? '')
    const nonEmptyValues = values.filter((v) => v.trim() !== '')
    const samples = nonEmptyValues.slice(0, SAMPLE_SIZE)
    return {
      field,
      count: values.length,
      nonEmpty: nonEmptyValues.length,
      samples: samples.slice(0, 5),
      suggestion: suggestField(field, samples, lib)
    }
  })
}

export function profileJson(j: JsonData, lib: Library): FieldProfile[] {
  const groups = new Map<string, { count: number; nonEmpty: number; samples: string[] }>()
  for (const leaf of collectLeaves(j.value)) {
    const g = groups.get(leaf.general) ?? { count: 0, nonEmpty: 0, samples: [] }
    g.count++
    const s = String(leaf.value)
    if (s.trim()) {
      g.nonEmpty++
      if (g.samples.length < SAMPLE_SIZE) g.samples.push(s)
    }
    groups.set(leaf.general, g)
  }
  return [...groups.entries()].map(([field, g]) => ({
    field,
    count: g.count,
    nonEmpty: g.nonEmpty,
    samples: g.samples.slice(0, 5),
    suggestion: suggestField(field, g.samples, lib)
  }))
}
