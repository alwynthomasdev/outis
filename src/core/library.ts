import defaults from './default-library.json'
import type { Library } from './types'

export function defaultLibrary(): Library {
  return structuredClone(defaults) as Library
}

/**
 * Fill in anything missing from a user library with the defaults, so old or hand-edited
 * library files keep working. Lists the user has emptied stay empty (except the ones the
 * generators need at least one entry in).
 */
export function normaliseLibrary(input: Partial<Library> | null | undefined): Library {
  const d = defaultLibrary()
  if (!input || typeof input !== 'object') return d
  const list = <T>(v: T[] | undefined, fallback: T[], required = false): T[] =>
    Array.isArray(v) && (!required || v.length > 0) ? v : fallback
  return {
    version: 1,
    firstNames: {
      female: list(input.firstNames?.female, d.firstNames.female, true),
      male: list(input.firstNames?.male, d.firstNames.male, true)
    },
    lastNames: list(input.lastNames, d.lastNames, true),
    towns: list(input.towns, d.towns, true),
    streetNames: list(input.streetNames, d.streetNames, true),
    streetSuffixes: list(input.streetSuffixes, d.streetSuffixes, true),
    emailDomains: list(input.emailDomains, d.emailDomains, true),
    phoneFormats: {
      mobile: list(input.phoneFormats?.mobile, d.phoneFormats.mobile, true),
      landline: list(input.phoneFormats?.landline, d.phoneFormats.landline, true)
    },
    organisations: list(input.organisations, d.organisations),
    allowList: list(input.allowList, d.allowList),
    denyList: list(input.denyList, d.denyList),
    customDetectors: list(input.customDetectors, d.customDetectors)
  }
}
