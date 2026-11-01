import { ACTION_LABELS, PII_LABELS, PII_TYPES, type Action, type PiiType } from '@core/types'

/** Colour per PII type for highlights (works on light and dark backgrounds). */
const HUES: Record<PiiType, number> = {
  PERSON: 210,
  FIRST_NAME: 210,
  LAST_NAME: 210,
  EMAIL: 280,
  PHONE: 30,
  ADDRESS: 150,
  CITY: 150,
  POSTCODE: 150,
  LOCATION: 165,
  ORG: 330,
  USERNAME: 260,
  NI_NUMBER: 0,
  NHS_NUMBER: 0,
  CARD: 45,
  IBAN: 45,
  SORT_CODE: 45,
  ACCOUNT_NUMBER: 45,
  IP: 190,
  URL: 190,
  DATE: 95,
  MISC: 240,
  CUSTOM: 300,
  GENERIC: 220
}

export function typeColor(type: PiiType, dark: boolean): { bg: string; border: string } {
  const h = HUES[type] ?? 220
  return dark
    ? { bg: `hsla(${h}, 55%, 45%, 0.35)`, border: `hsl(${h}, 60%, 60%)` }
    : { bg: `hsla(${h}, 80%, 70%, 0.35)`, border: `hsl(${h}, 60%, 45%)` }
}

export const typeOptions = PII_TYPES.map((t) => ({ label: PII_LABELS[t], value: t }))

export const actionOptions = (Object.keys(ACTION_LABELS) as Action[]).map((a) => ({
  label: ACTION_LABELS[a],
  value: a
}))

export const label = (t: PiiType): string => PII_LABELS[t] ?? t
