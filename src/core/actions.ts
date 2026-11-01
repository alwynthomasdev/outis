import type { Mapper } from './mapper'
import type { Action, PiiType } from './types'

export function mask(value: string, keep = 4): string {
  const chars = [...value]
  let visible = 0
  for (let i = chars.length - 1; i >= 0; i--) {
    if (!/[\p{L}\p{N}]/u.test(chars[i])) continue
    if (visible < keep) visible++
    else chars[i] = '*'
  }
  return chars.join('')
}

export interface ActionInput {
  action: Action
  type: PiiType
  constant?: string
  maskKeep?: number
}

/** Apply a non-scan action to a single value. ("scan" is handled by the engine.) */
export function applyAction(value: string, rule: ActionInput, mapper: Mapper): string {
  if (value === '' && rule.action !== 'constant') return value
  switch (rule.action) {
    case 'fake':
      return mapper.fake(rule.type, value)
    case 'mask':
      return mask(value, rule.maskKeep ?? 4)
    case 'hash':
      return mapper.hash(value)
    case 'redact':
      return `[${rule.type}]`
    case 'constant':
      return rule.constant ?? ''
    case 'clear':
      return ''
    default:
      return value
  }
}
