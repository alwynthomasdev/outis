// Checksum validators. Used to cut false positives in detection and to make fakes look valid.

export const digitsOf = (s: string): string => s.replace(/\D/g, '')

/** Luhn check (payment cards). */
export function luhnValid(num: string): boolean {
  const d = digitsOf(num)
  if (d.length < 12) return false
  let sum = 0
  let double = false
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48
    if (double) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    double = !double
  }
  return sum % 10 === 0
}

/** Check digit that makes `partial + digit` pass Luhn. */
export function luhnCheckDigit(partial: string): string {
  for (let c = 0; c <= 9; c++) if (luhnValid(partial + c)) return String(c)
  return '0'
}

/** NHS number modulus-11 check. Returns the check digit for 9 digits, or null if invalid (10). */
export function nhsCheckDigit(nine: string): number | null {
  let sum = 0
  for (let i = 0; i < 9; i++) sum += (nine.charCodeAt(i) - 48) * (10 - i)
  const check = 11 - (sum % 11)
  if (check === 11) return 0
  if (check === 10) return null
  return check
}

export function nhsValid(num: string): boolean {
  const d = digitsOf(num)
  if (d.length !== 10) return false
  return nhsCheckDigit(d.slice(0, 9)) === d.charCodeAt(9) - 48
}

function mod97(numeric: string): number {
  let rem = 0
  for (let i = 0; i < numeric.length; i += 7) {
    rem = Number(String(rem) + numeric.slice(i, i + 7)) % 97
  }
  return rem
}

function ibanNumeric(rearranged: string): string {
  return rearranged
    .toUpperCase()
    .split('')
    .map((ch) => (ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch))
    .join('')
}

export function ibanValid(iban: string): boolean {
  const s = iban.replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false
  return mod97(ibanNumeric(s.slice(4) + s.slice(0, 4))) === 1
}

/** Compute the 2-digit IBAN check for a country code and BBAN. */
export function ibanCheck(country: string, bban: string): string {
  const rem = mod97(ibanNumeric(bban + country + '00'))
  return String(98 - rem).padStart(2, '0')
}

const NI_BAD_PREFIXES = new Set(['BG', 'GB', 'NK', 'KN', 'TN', 'NT', 'ZZ'])

export function niValid(ni: string): boolean {
  const s = ni.replace(/\s/g, '').toUpperCase()
  if (!/^[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\d{6}[A-D]$/.test(s)) return false
  return !NI_BAD_PREFIXES.has(s.slice(0, 2))
}

export function ipv4Valid(ip: string): boolean {
  const parts = ip.split('.')
  return (
    parts.length === 4 &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255 && !(p.length > 1 && p[0] === '0'))
  )
}
