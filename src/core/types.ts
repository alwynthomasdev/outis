// Shared types for the anonymisation engine. Pure TS: used by main, worker and renderer.

export const PII_TYPES = [
  'PERSON',
  'FIRST_NAME',
  'LAST_NAME',
  'EMAIL',
  'PHONE',
  'ADDRESS',
  'CITY',
  'POSTCODE',
  'LOCATION',
  'ORG',
  'USERNAME',
  'NI_NUMBER',
  'NHS_NUMBER',
  'CARD',
  'IBAN',
  'SORT_CODE',
  'ACCOUNT_NUMBER',
  'IP',
  'URL',
  'DATE',
  'MISC',
  'CUSTOM',
  'GENERIC'
] as const

export type PiiType = (typeof PII_TYPES)[number]

export const PII_LABELS: Record<PiiType, string> = {
  PERSON: 'Full name',
  FIRST_NAME: 'First name',
  LAST_NAME: 'Last name',
  EMAIL: 'Email',
  PHONE: 'Phone number',
  ADDRESS: 'Street address',
  CITY: 'Town / city',
  POSTCODE: 'Postcode',
  LOCATION: 'Location (place)',
  ORG: 'Organisation',
  USERNAME: 'Username',
  NI_NUMBER: 'NI number',
  NHS_NUMBER: 'NHS number',
  CARD: 'Card number',
  IBAN: 'IBAN',
  SORT_CODE: 'Sort code',
  ACCOUNT_NUMBER: 'Account number',
  IP: 'IP address',
  URL: 'URL',
  DATE: 'Date',
  MISC: 'Other entity',
  CUSTOM: 'Custom',
  GENERIC: 'Other (scramble characters)'
}

/** What to do with a value. */
export type Action = 'fake' | 'mask' | 'hash' | 'redact' | 'keep' | 'constant' | 'clear' | 'scan'

export const ACTION_LABELS: Record<Action, string> = {
  fake: 'Replace with fake',
  mask: 'Mask (****1234)',
  hash: 'Hash',
  redact: 'Redact ([TYPE])',
  constant: 'Fixed value',
  clear: 'Empty',
  scan: 'Scan as free text',
  keep: 'Keep unchanged'
}

export type SpanSource = 'rule' | 'ner' | 'dictionary' | 'deny' | 'user'

/** A piece of PII found in a text. Offsets are UTF-16 indices into the text. */
export interface Span {
  start: number
  end: number
  type: PiiType
  text: string
  score: number
  source: SpanSource
  detector: string
}

/** One rule in a recipe: applies to a CSV column name or a JSON path pattern. */
export interface FieldRule {
  field: string
  action: Action
  type: PiiType
  constant?: string
  /** For mask: number of trailing characters left visible. */
  maskKeep?: number
}

export interface Recipe {
  version: 1
  name?: string
  format: 'csv' | 'json'
  rules: FieldRule[]
}

export interface CustomDetector {
  id: string
  name: string
  pattern: string
  flags: string
  type: PiiType
  enabled: boolean
}

export interface PhoneFormats {
  mobile: string[]
  landline: string[]
}

export interface Town {
  name: string
  /** Postcode area letters, e.g. "LS" for Leeds. */
  postcodeArea: string
}

/** The editable PII library: fake values to draw from, plus detection lists. */
export interface Library {
  version: 1
  firstNames: { female: string[]; male: string[] }
  lastNames: string[]
  towns: Town[]
  streetNames: string[]
  streetSuffixes: string[]
  emailDomains: string[]
  phoneFormats: PhoneFormats
  organisations: string[]
  /** Terms that are never treated as PII. */
  allowList: string[]
  /** Terms that are always treated as PII. */
  denyList: string[]
  customDetectors: CustomDetector[]
}

export interface TextOptions {
  /** Which PII types to act on. */
  enabledTypes: PiiType[]
  /** Minimum score for ML (NER) matches. */
  nerThreshold: number
  useNer: boolean
  /** How each type is replaced in free text. */
  action: 'fake' | 'redact' | 'mask'
}

export interface Settings {
  /** Secret used to derive consistent fakes. Same key + same input = same fake. */
  consistencyKey: string
  csvHasHeader: boolean
  text: TextOptions
}

export interface TableData {
  kind: 'table'
  columns: string[]
  /** Header row exactly as in the file (columns may be de-duplicated). */
  header: string[]
  rows: string[][]
  delimiter: string
  newline: string
  bom: boolean
  hasHeader: boolean
}

export interface JsonData {
  kind: 'json'
  value: unknown
  jsonl: boolean
  indent: number
}

export type Dataset = TableData | JsonData

export interface Suggestion {
  action: Action
  type: PiiType
  confidence: number
  reason: string
}

export interface FieldProfile {
  field: string
  count: number
  nonEmpty: number
  samples: string[]
  suggestion: Suggestion | null
}

export interface CellChange {
  row: number
  col: number
  before: string
  after: string
  type: PiiType
}

export interface JsonChange {
  /** Concrete path, e.g. users[3].email */
  path: string
  /** Generalised path the rule matched, e.g. users[*].email */
  field: string
  before: string
  after: string
  type: PiiType
}

export interface Replacement {
  /** Offsets in the original text. */
  start: number
  end: number
  /** Offsets in the output text. */
  outStart: number
  outEnd: number
  before: string
  after: string
  type: PiiType
}

export interface TextResult {
  output: string
  replacements: Replacement[]
}

export interface RunSummary {
  changed: number
  byType: Partial<Record<PiiType, number>>
  rowsAffected: number
  fieldsTouched: number
}
