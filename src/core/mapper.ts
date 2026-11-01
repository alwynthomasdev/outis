// Consistent fake value generation.
// Each (type, original value) pair is seeded from HMAC(consistencyKey, value), so the same input
// always gives the same fake for a given key. Names are mapped word by word, which keeps
// "Sarah Jenkins", "Mrs Jenkins" and "sarah.jenkins@..." consistent with each other.
import { fakerEN_GB as faker } from '@faker-js/faker'
import { createRng, hmacHex, pick, randInt, seedFor, type Rng } from './hash'
import type { Library, PiiType } from './types'
import { digitsOf, ibanCheck, luhnCheckDigit, nhsCheckDigit } from './validators'

const TITLES = new Set([
  'mr',
  'mrs',
  'ms',
  'miss',
  'mx',
  'dr',
  'prof',
  'sir',
  'dame',
  'rev',
  'lord',
  'lady'
])
const POSTCODE_LETTERS = 'ABDEFGHJLNPQRSTUWXYZ'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

/** Copy the letter case style of `original` onto `fake` (all upper, all lower, or as-is). */
export function matchCase(original: string, fake: string): string {
  if (!/[a-z]/i.test(original)) return fake
  if (original === original.toUpperCase() && original.length > 1) return fake.toUpperCase()
  if (original === original.toLowerCase()) return fake.toLowerCase()
  return fake
}

/** Replace each letter/digit of `original` with the next character of `chars`, keeping separators. */
export function fillPattern(original: string, chars: string): string {
  let i = 0
  let out = ''
  for (const ch of original) {
    if (/[A-Za-z0-9]/.test(ch) && i < chars.length) out += chars[i++]
    else out += ch
  }
  return out + chars.slice(i)
}

/** Random characters of the same class: digit→digit, upper→upper, lower→lower. */
export function scramble(rng: Rng, value: string): string {
  let out = ''
  for (const ch of value) {
    if (ch >= '0' && ch <= '9') out += String(randInt(rng, 0, 9))
    else if (ch >= 'A' && ch <= 'Z') out += pick(rng, UPPER)
    else if (ch >= 'a' && ch <= 'z') out += pick(rng, LOWER)
    else out += ch
  }
  return out
}

/** Name key: lower case, apostrophes removed, so O'Brien and obrien (in an email) match. */
const nameKey = (s: string): string => s.toLowerCase().replace(/['’]/g, '')

const randDigits = (rng: Rng, n: number): string =>
  Array.from({ length: n }, () => String(randInt(rng, 0, 9))).join('')

export class Mapper {
  private cache = new Map<string, string>()
  private reverse = new Map<string, string>()
  private female: Set<string>
  private male: Set<string>
  private knownLast: Set<string>
  private seenFirst = new Set<string>()
  private seenLast = new Set<string>()

  constructor(
    private readonly key: string,
    private readonly lib: Library
  ) {
    this.female = new Set(lib.firstNames.female.map(nameKey))
    this.male = new Set(lib.firstNames.male.map(nameKey))
    this.knownLast = new Set(lib.lastNames.map(nameKey))
  }

  /** Number of distinct values mapped so far. */
  get size(): number {
    return this.cache.size
  }

  /** All original → fake pairs (sensitive: only export when the user asks). */
  entries(): { type: string; original: string; fake: string }[] {
    return [...this.cache.entries()].map(([k, fake]) => {
      const [type, original] = k.split('\0')
      return { type, original, fake }
    })
  }

  hash(value: string): string {
    return hmacHex(this.key, value).slice(0, 16)
  }

  private rng(type: string, norm: string, attempt: number): Rng {
    return createRng(seedFor(this.key, `${type}|${norm}|${attempt}`))
  }

  /**
   * Generate once per (type, normalised value) and cache it. Re-rolls when the fake
   * collides with another original's fake, or equals the original.
   */
  private memo(type: string, norm: string, gen: (rng: Rng) => string, unique = true): string {
    const k = type + '\0' + norm
    const hit = this.cache.get(k)
    if (hit !== undefined) return hit
    let out = ''
    for (let attempt = 0; attempt < 25; attempt++) {
      out = gen(this.rng(type, norm, attempt))
      const outNorm = out.toLowerCase()
      if (outNorm === norm && attempt < 24) continue
      if (!unique) break
      const rk = type + '\0' + outNorm
      const owner = this.reverse.get(rk)
      if (owner === undefined || owner === norm) {
        this.reverse.set(rk, norm)
        break
      }
    }
    this.cache.set(k, out)
    return out
  }

  fake(type: PiiType, value: string): string {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(value)!
    const [, lead, core, trail] = m
    if (!core) return value
    return lead + this.fakeCore(type, core) + trail
  }

  private fakeCore(type: PiiType, v: string): string {
    switch (type) {
      case 'PERSON':
        return this.person(v)
      case 'FIRST_NAME':
        return this.nameWords(v, 'first')
      case 'LAST_NAME':
        return this.nameWords(v, 'last')
      case 'EMAIL':
        return this.email(v)
      case 'USERNAME':
        return this.localPart(v)
      case 'PHONE':
        return this.phone(v)
      case 'ADDRESS':
        return this.address(v)
      case 'CITY':
      case 'LOCATION':
        return matchCase(
          v,
          this.memo('CITY', v.toLowerCase(), (r) => pick(r, this.lib.towns).name)
        )
      case 'POSTCODE':
        return this.postcode(v)
      case 'ORG':
        return this.org(v)
      case 'NI_NUMBER':
        return this.ni(v)
      case 'NHS_NUMBER':
        return this.nhs(v)
      case 'CARD':
        return this.card(v)
      case 'IBAN':
        return this.iban(v)
      case 'IP':
        return this.ip(v)
      case 'URL':
        return this.url(v)
      case 'DATE':
        return this.date(v)
      default:
        return this.memo(type, v, (r) => scramble(r, v))
    }
  }

  // ---- names ---------------------------------------------------------------

  private first(word: string): string {
    const norm = nameKey(word)
    this.seenFirst.add(norm)
    const list = this.female.has(norm)
      ? this.lib.firstNames.female
      : this.male.has(norm)
        ? this.lib.firstNames.male
        : [...this.lib.firstNames.female, ...this.lib.firstNames.male]
    return matchCase(
      word,
      this.memo('FIRST_NAME', norm, (r) => pick(r, list))
    )
  }

  private last(word: string): string {
    const norm = nameKey(word)
    this.seenLast.add(norm)
    return matchCase(
      word,
      this.memo('LAST_NAME', norm, (r) => pick(r, this.lib.lastNames))
    )
  }

  private initial(letter: string): string {
    return matchCase(
      letter,
      this.memo('INITIAL', letter.toLowerCase(), (r) => pick(r, UPPER), false)
    )
  }

  /** Map each word of a (possibly hyphenated or multi-word) name. */
  private nameWords(v: string, role: 'first' | 'last'): string {
    return v.replace(/[\p{L}][\p{L}']*/gu, (w) =>
      w.length === 1 ? this.initial(w) : role === 'first' ? this.first(w) : this.last(w)
    )
  }

  private isLikelyLast(norm: string): boolean {
    return (
      (this.knownLast.has(norm) || this.seenLast.has(norm)) &&
      !this.female.has(norm) &&
      !this.male.has(norm)
    )
  }

  private person(v: string): string {
    // "Surname, First" form
    const comma = /^([^,]+),\s*(.+)$/.exec(v)
    if (comma) return `${this.nameWords(comma[1], 'last')}, ${this.person(comma[2])}`

    const parts = v.split(/(\s+)/)
    const wordIdx = parts
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => /\p{L}/u.test(p) && !TITLES.has(p.replace(/\.$/, '').toLowerCase()))
      .map(({ i }) => i)
    const hasTitle = parts.some((p) => TITLES.has(p.replace(/\.$/, '').toLowerCase()))

    wordIdx.forEach((idx, n) => {
      const word = parts[idx]
      const isInitial = /^\p{L}\.?$/u.test(word)
      if (isInitial) {
        parts[idx] = this.initial(word[0]) + word.slice(1)
        return
      }
      let role: 'first' | 'last'
      if (wordIdx.length === 1) {
        const norm = nameKey(word)
        role = hasTitle || this.isLikelyLast(norm) ? 'last' : 'first'
      } else role = n === wordIdx.length - 1 ? 'last' : 'first'
      parts[idx] = this.nameWords(word, role)
    })
    return parts.join('')
  }

  // ---- email / usernames ---------------------------------------------------

  private domain(d: string): string {
    return this.memo('DOMAIN', d.toLowerCase(), (r) => pick(r, this.lib.emailDomains), false)
  }

  /** Map an email local part or username, keeping names recognisable as names. */
  private localPart(local: string): string {
    const pieces = local.split(/([._+-])/)
    const words = pieces.filter((p, i) => i % 2 === 0 && p.length > 0)
    const alphaWords = words.map((w) => /^([A-Za-z]+)(\d*)$/.exec(w))

    if (words.length >= 2 && alphaWords.every(Boolean)) {
      let wn = 0
      return pieces
        .map((p, i) => {
          if (i % 2 === 1 || p.length === 0) return p
          const [, letters, digits] = /^([A-Za-z]+)(\d*)$/.exec(p)!
          const isLastWord = wn++ === words.length - 1
          const name =
            letters.length === 1
              ? this.initial(letters)
              : isLastWord
                ? this.last(letters)
                : this.first(letters)
          return matchCase(letters, name).replace(/'/g, '') + this.digits(digits)
        })
        .join('')
    }

    const single = /^([A-Za-z]+)(\d*)$/.exec(local)
    if (single) {
      const [, letters, digits] = single
      const norm = letters.toLowerCase()
      let mapped: string | null = null
      if (this.female.has(norm) || this.male.has(norm) || this.seenFirst.has(norm))
        mapped = this.first(letters)
      else if (this.isLikelyLast(norm)) mapped = this.last(letters)
      else if (letters.length > 3 && this.isLikelyLast(norm.slice(1)))
        mapped = this.initial(letters[0]) + this.last(letters.slice(1))
      if (mapped) return matchCase(letters, mapped).replace(/'/g, '') + this.digits(digits)
    }
    return this.memo('USERNAME', local.toLowerCase(), (r) => {
      const f = pick(r, [...this.lib.firstNames.female, ...this.lib.firstNames.male])
      const l = pick(r, this.lib.lastNames)
      return (
        matchCase(local, `${f}.${l}`.replace(/'/g, '').toLowerCase()) +
        (/\d/.test(local) ? randDigits(r, 2) : '')
      )
    })
  }

  private digits(d: string): string {
    if (!d) return ''
    return this.memo('DIGITS', d, (r) => randDigits(r, d.length), false)
  }

  private email(v: string): string {
    const m = /^([^@\s]+)@([^@\s]+)$/.exec(v)
    if (!m) return this.memo('GENERIC', v, (r) => scramble(r, v))
    const out = `${this.localPart(m[1])}@${this.domain(m[2])}`
    // Register to keep fake emails distinct where possible.
    return this.memo('EMAIL', v.toLowerCase(), () => out)
  }

  // ---- phone / address -----------------------------------------------------

  private phone(v: string): string {
    const d = digitsOf(v)
    const intl = /^\s*(\+|00)/.test(v)
    const uk = !intl || /^(\+|00)\s*44/.test(v.trim())
    if (!uk) {
      // Keep the country code, scramble the rest.
      const cc = /^\s*(?:\+|00)(\d{1,3})/.exec(v)?.[1] ?? ''
      return this.memo('PHONE', d, (r) => {
        const body = scramble(r, v.trim().slice(v.trim().indexOf(cc) + cc.length))
        return v.trim().slice(0, v.trim().indexOf(cc) + cc.length) + body
      })
    }
    const national = intl ? '0' + d.replace(/^(00)?44/, '') : d
    const mobile = national.startsWith('07')
    // Cache the national number; apply this value's own formatting afterwards.
    const nationalFake = this.memo('PHONE', national, (r) => {
      const tpl = pick(r, mobile ? this.lib.phoneFormats.mobile : this.lib.phoneFormats.landline)
      return tpl.replace(/#/g, () => String(randInt(r, 0, 9)))
    })
    const trimmed = v.trim()
    const body = trimmed.replace(/^(\+|00)\s*44\s?/, '')
    let local = nationalFake
    if (intl) local = local.slice(1)
    if (!/\s/.test(body)) local = local.replace(/\s/g, /-/.test(body) ? '-' : '')
    if (!intl) return local
    const prefix = trimmed.startsWith('00') ? '0044' : '+44'
    return prefix + (/^(\+|00)\s*44\s/.test(trimmed) ? ' ' : '') + local
  }

  private townAndPostcode(r: Rng): { town: string; postcode: string } {
    const t = pick(r, this.lib.towns)
    const district = t.postcodeArea.length === 1 ? randInt(r, 1, 40) : randInt(r, 1, 20)
    const postcode = `${t.postcodeArea}${district} ${randInt(r, 1, 9)}${pick(r, POSTCODE_LETTERS)}${pick(r, POSTCODE_LETTERS)}`
    return { town: t.name, postcode }
  }

  /**
   * Fake postcodes follow the town mapping: if LS is Leeds and Leeds maps to Luton,
   * LS6 2AB becomes LU-something. Otherwise a random town's area is used.
   */
  private postcode(v: string): string {
    const compact = v.replace(/\s/g, '').toUpperCase()
    const pc = this.memo('POSTCODE', compact, (r) => {
      const area = /^[A-Z]{1,2}/.exec(compact)?.[0]
      const town = area ? this.lib.towns.find((t) => t.postcodeArea === area) : undefined
      const fakeTownName = town ? this.fakeCore('CITY', town.name) : null
      const fakeTown = fakeTownName
        ? this.lib.towns.find((t) => t.name === fakeTownName)
        : undefined
      if (!fakeTown) return this.townAndPostcode(r).postcode
      const district = fakeTown.postcodeArea.length === 1 ? randInt(r, 1, 40) : randInt(r, 1, 20)
      return `${fakeTown.postcodeArea}${district} ${randInt(r, 1, 9)}${pick(r, POSTCODE_LETTERS)}${pick(r, POSTCODE_LETTERS)}`
    })
    const out = /\s/.test(v) ? pc : pc.replace(/\s/g, '')
    return matchCase(v, out)
  }

  private address(v: string): string {
    const segments = v.split(',').length
    return this.memo('ADDRESS', v.toLowerCase(), (r) => {
      const street = `${randInt(r, 1, 199)} ${pick(r, this.lib.streetNames)} ${pick(r, this.lib.streetSuffixes)}`
      const { town, postcode } = this.townAndPostcode(r)
      const parts = [street, town, postcode].slice(0, Math.min(3, segments))
      return matchCase(v, parts.join(', '))
    })
  }

  private org(v: string): string {
    return this.memo('ORG', v.toLowerCase(), (r) => {
      if (this.lib.organisations.length > 0) return pick(r, this.lib.organisations)
      faker.seed(Math.floor(r() * 2 ** 31))
      return faker.company.name()
    })
  }

  // ---- identifiers ---------------------------------------------------------

  private ni(v: string): string {
    const norm = v.replace(/\s/g, '').toUpperCase()
    return matchCase(
      v,
      fillPattern(
        v,
        this.memo('NI_NUMBER', norm, (r) => 'QQ' + randDigits(r, 6) + pick(r, 'ABCD'))
      )
    )
  }

  private nhs(v: string): string {
    const digits = this.memo('NHS_NUMBER', digitsOf(v), (r) => {
      for (;;) {
        const nine = '999' + randDigits(r, 6)
        const check = nhsCheckDigit(nine)
        if (check !== null) return nine + check
      }
    })
    return fillPattern(v, digits)
  }

  private card(v: string): string {
    const d = digitsOf(v)
    const digits = this.memo('CARD', d, (r) => {
      const partial = '4000' + randDigits(r, Math.max(0, d.length - 5))
      return partial + luhnCheckDigit(partial)
    })
    return fillPattern(v, digits)
  }

  private iban(v: string): string {
    const compact = v.replace(/\s/g, '').toUpperCase()
    const iban = this.memo('IBAN', compact, (r) => {
      const country = compact.slice(0, 2)
      const bban =
        country === 'GB' && compact.length === 22
          ? 'TEST' + randDigits(r, 14)
          : scramble(r, compact.slice(4))
      return country + ibanCheck(country, bban) + bban
    })
    return /\s/.test(v) ? iban.replace(/(.{4})(?=.)/g, '$1 ') : iban
  }

  private ip(v: string): string {
    return this.memo('IP', v.toLowerCase(), (r) => {
      if (v.includes(':')) {
        const h = (): string => randInt(r, 0, 0xffff).toString(16)
        return `2001:db8::${h()}:${h()}`
      }
      return `${pick(r, ['192.0.2', '198.51.100', '203.0.113'])}.${randInt(r, 1, 254)}`
    })
  }

  private url(v: string): string {
    return this.memo('URL', v, (r) => {
      try {
        const u = new URL(v)
        const host = this.domain(u.hostname)
        const rest = scramble(r, u.pathname + u.search + u.hash)
        return `${u.protocol}//${host}${rest === '/' && !v.endsWith('/') ? '' : rest}`
      } catch {
        return scramble(r, v)
      }
    })
  }

  // ---- dates ---------------------------------------------------------------

  /** Shift a date by a consistent random number of days, keeping its format. */
  private date(v: string): string {
    return this.memo('DATE', v, (r) => {
      let shift = randInt(r, -180, 180)
      if (shift === 0) shift = 1
      const move = (y: number, mo: number, d: number): Date => {
        const dt = new Date(Date.UTC(y, mo - 1, d))
        dt.setUTCDate(dt.getUTCDate() + shift)
        return dt
      }
      const pad = (n: number, like: string): string =>
        like.length === 2 ? String(n).padStart(2, '0') : String(n)

      let m = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(v)
      if (m) {
        const dt = move(+m[1], +m[2], +m[3])
        return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1, '00')}-${pad(dt.getUTCDate(), '00')}${m[4]}`
      }
      m = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{2}|\d{4})$/.exec(v)
      if (m) {
        const short = m[4].length === 2
        const year = short ? 2000 + +m[4] - (+m[4] > 40 ? 100 : 0) : +m[4]
        const dt = move(year, +m[3], +m[1])
        const y = short
          ? String(dt.getUTCFullYear() % 100).padStart(2, '0')
          : String(dt.getUTCFullYear())
        return `${pad(dt.getUTCDate(), m[1])}${m[2]}${pad(dt.getUTCMonth() + 1, m[3])}${m[2]}${y}`
      }
      m = /^(\d{1,2})(st|nd|rd|th)? ([A-Za-z]+)(,?) (\d{4})$/.exec(v)
      const monthIdx = m
        ? MONTHS_LONG.findIndex((mn) =>
            mn.toLowerCase().startsWith(m![3].toLowerCase().slice(0, 3))
          )
        : -1
      if (m && monthIdx >= 0) {
        const dt = move(+m[5], monthIdx + 1, +m[1])
        const day = dt.getUTCDate()
        const suffix = m[2]
          ? day % 10 === 1 && day !== 11
            ? 'st'
            : day % 10 === 2 && day !== 12
              ? 'nd'
              : day % 10 === 3 && day !== 13
                ? 'rd'
                : 'th'
          : ''
        const name = MONTHS_LONG[dt.getUTCMonth()]
        const month =
          m[3].length <= 4 && m[3].length < name.length ? name.slice(0, m[3].length) : name
        return `${pad(day, m[1])}${suffix} ${matchCase(m[3], month)}${m[4]} ${dt.getUTCFullYear()}`
      }
      return v.replace(/\d/g, () => String(randInt(r, 0, 9)))
    })
  }
}
