export * from './types'
export * from './detectors'
export * from './validators'
export * from './mapper'
export * from './actions'
export * from './text'
export * from './paths'
export * from './formats'
export * from './engine'
export * from './suggest'
export * from './library'
export * from './ner'
export { randomKey } from './hash'

import { randomKey } from './hash'
import type { PiiType, Settings } from './types'

/** Types acted on in free text by default. MISC (nationalities, events…) is opt-in because it is noisy. */
export const DEFAULT_TEXT_TYPES: PiiType[] = [
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
  'CUSTOM'
]

export function defaultSettings(): Settings {
  return {
    consistencyKey: randomKey(),
    csvHasHeader: true,
    text: { enabledTypes: [...DEFAULT_TEXT_TYPES], nerThreshold: 0.6, useNer: true, action: 'fake' }
  }
}

export function normaliseSettings(input: Partial<Settings> | null | undefined): Settings {
  const d = defaultSettings()
  if (!input) return d
  return {
    consistencyKey:
      typeof input.consistencyKey === 'string' && input.consistencyKey
        ? input.consistencyKey
        : d.consistencyKey,
    csvHasHeader: input.csvHasHeader ?? d.csvHasHeader,
    text: { ...d.text, ...(input.text ?? {}) }
  }
}
