import { describe, expect, it } from 'vitest'
import {
  Mapper,
  anonymiseText,
  collectLeaves,
  defaultLibrary,
  detectRules,
  ibanValid,
  luhnValid,
  mask,
  mergeSpans,
  nhsValid,
  niValid,
  parseCsv,
  parseJson,
  pathMatches,
  profileTable,
  runJson,
  runTable,
  serialiseCsv,
  tokensToSpans,
  chunkText
} from './index'

const lib = defaultLibrary()
const noScan = async (texts: string[]): Promise<never[][]> => texts.map(() => [])
const types = (text: string): string[] =>
  mergeSpans(detectRules(text, { library: lib })).map((s) => `${s.type}:${s.text}`)

describe('validators', () => {
  it('checks NI numbers', () => {
    expect(niValid('AB123456C')).toBe(true)
    expect(niValid('AB 12 34 56 C')).toBe(true)
    expect(niValid('BG123456C')).toBe(false)
    expect(niValid('QQ123456C')).toBe(false)
    expect(niValid('AB123456E')).toBe(false)
  })
  it('checks NHS numbers (mod 11)', () => {
    expect(nhsValid('943 476 5919')).toBe(true)
    expect(nhsValid('943 476 5918')).toBe(false)
  })
  it('checks cards (Luhn) and IBANs (mod 97)', () => {
    expect(luhnValid('4111 1111 1111 1111')).toBe(true)
    expect(luhnValid('4111 1111 1111 1112')).toBe(false)
    expect(ibanValid('GB82 WEST 1234 5698 7654 32')).toBe(true)
    expect(ibanValid('GB83 WEST 1234 5698 7654 32')).toBe(false)
  })
})

describe('rule detectors', () => {
  it('finds common UK PII in text', () => {
    const found = types(
      'Email sarah.jenkins@gmail.com or call 07700 900123. NI AB123456C, NHS number 943 476 5919, postcode LS1 4AB.'
    )
    expect(found).toContain('EMAIL:sarah.jenkins@gmail.com')
    expect(found).toContain('PHONE:07700 900123')
    expect(found).toContain('NI_NUMBER:AB123456C')
    expect(found).toContain('NHS_NUMBER:943 476 5919')
    expect(found).toContain('POSTCODE:LS1 4AB')
  })
  it('finds international formats', () => {
    const found = types(
      'Card 4111 1111 1111 1111, IBAN GB82 WEST 1234 5698 7654 32, from 10.0.0.12, +33 1 23 45 67 89'
    )
    expect(found).toContain('CARD:4111 1111 1111 1111')
    expect(found).toContain('IBAN:GB82 WEST 1234 5698 7654 32')
    expect(found).toContain('IP:10.0.0.12')
    expect(found).toContain('PHONE:+33 1 23 45 67 89')
  })
  it('rejects values that fail checksums', () => {
    expect(types('Card 4111 1111 1111 1112')).not.toContainEqual(expect.stringMatching(/^CARD/))
    expect(types('Ref 999.999.999.999')).not.toContainEqual(expect.stringMatching(/^IP/))
  })
  it('finds names after titles and from the dictionary', () => {
    expect(types('Please ask Mrs Patel about it')).toContain('PERSON:Patel')
    expect(types('Spoke to Olivia Bennett today')).toContain('PERSON:Olivia Bennett')
  })
  it('finds street addresses and towns', () => {
    const found = types('She moved to 14 Oak Avenue, Leeds LS6 2AB last year.')
    expect(found).toContain('ADDRESS:14 Oak Avenue')
    expect(found).toContain('CITY:Leeds')
    expect(found).toContain('POSTCODE:LS6 2AB')
  })
  it('respects allow and deny lists', () => {
    const custom = { ...lib, denyList: ['Project Falcon'] }
    const spans = mergeSpans(
      detectRules('About Project Falcon and Olivia Bennett', { library: custom }),
      ['Olivia Bennett']
    )
    expect(spans.map((s) => s.text)).toEqual(['Project Falcon'])
  })
})

describe('mapper', () => {
  it('is consistent for the same key and differs for another key', () => {
    const a = new Mapper('key-1', lib)
    const b = new Mapper('key-1', lib)
    const c = new Mapper('key-2', lib)
    expect(a.fake('PERSON', 'Sarah Jenkins')).toBe(b.fake('PERSON', 'Sarah Jenkins'))
    expect(a.fake('EMAIL', 'x@y.com')).toBe(a.fake('EMAIL', 'x@y.com'))
    const names = ['Sarah Jenkins', 'Tom Hughes', 'Ann Lee', 'Bob Ross'].map((n) =>
      a.fake('PERSON', n)
    )
    const other = ['Sarah Jenkins', 'Tom Hughes', 'Ann Lee', 'Bob Ross'].map((n) =>
      c.fake('PERSON', n)
    )
    expect(names).not.toEqual(other)
  })
  it('keeps names, titles and emails coherent', () => {
    const m = new Mapper('k', lib)
    const full = m.fake('PERSON', 'Sarah Jenkins')
    const [f, l] = full.split(' ')
    expect(full).not.toBe('Sarah Jenkins')
    expect(m.fake('PERSON', 'Mrs Jenkins')).toBe(`Mrs ${l}`)
    expect(m.fake('FIRST_NAME', 'sarah')).toBe(f.toLowerCase())
    expect(m.fake('EMAIL', 'sarah.jenkins@gmail.com')).toMatch(
      new RegExp(`^${f.toLowerCase()}\\.${l.toLowerCase().replace("'", '')}@`)
    )
  })
  it('links initial+surname usernames to the surname mapping', () => {
    const m = new Mapper('k', lib)
    const last = m.fake('LAST_NAME', "O'Brien")
    const email = m.fake('EMAIL', 'jobrien@btinternet.com')
    expect(email).toMatch(new RegExp(`^[a-z]${last.toLowerCase().replace(/'/g, '')}@`))
  })
  it('makes valid-looking identifiers in safe ranges', () => {
    const m = new Mapper('k', lib)
    expect(niValid(m.fake('NI_NUMBER', 'AB123456C').replace(/^QQ/, 'AB'))).toBe(true)
    expect(m.fake('NI_NUMBER', 'AB 12 34 56 C')).toMatch(/^QQ \d\d \d\d \d\d [A-D]$/)
    const nhs = m.fake('NHS_NUMBER', '943 476 5919')
    expect(nhs).toMatch(/^999 \d{3} \d{4}$/)
    expect(nhsValid(nhs)).toBe(true)
    expect(luhnValid(m.fake('CARD', '4111 1111 1111 1111'))).toBe(true)
    expect(ibanValid(m.fake('IBAN', 'GB82 WEST 1234 5698 7654 32'))).toBe(true)
    expect(m.fake('PHONE', '07123 456789')).toMatch(/^07700 900\d{3}$/)
    expect(m.fake('PHONE', '+447123456789')).toMatch(/^\+447700900\d{3}$/)
    expect(m.fake('IP', '10.1.2.3')).toMatch(/^(192\.0\.2|198\.51\.100|203\.0\.113)\.\d+$/)
    expect(m.fake('EMAIL', 'someone@corp.co.uk')).toMatch(
      /@(example\.(com|org|net)|mail\.example|test\.example)$/
    )
  })
  it('keeps fake postcodes in the same area as the fake town', () => {
    const m = new Mapper('k', lib)
    const town = m.fake('CITY', 'Leeds')
    const area = lib.towns.find((t) => t.name === town)!.postcodeArea
    expect(m.fake('POSTCODE', 'LS6 2AB')).toMatch(new RegExp(`^${area}\\d+ \\d[A-Z]{2}$`))
  })
  it('shifts dates keeping their format', () => {
    const m = new Mapper('k', lib)
    expect(m.fake('DATE', '1985-03-12')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(m.fake('DATE', '12/03/1985')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    expect(m.fake('DATE', '12 March 1985')).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/)
  })
  it('keeps whitespace and letter case', () => {
    const m = new Mapper('k', lib)
    expect(m.fake('LAST_NAME', ' JENKINS ')).toMatch(/^ [A-Z']+ $/)
  })
})

describe('actions', () => {
  it('masks all but the last characters', () => {
    expect(mask('4111 1111 1111 1234')).toBe('**** **** **** 1234')
  })
})

describe('text', () => {
  it('replaces spans and reports positions in both texts', () => {
    const m = new Mapper('k', lib)
    const text = 'Contact Mrs Patel on 07700 900123.'
    const res = anonymiseText(text, mergeSpans(detectRules(text, { library: lib })), m)
    expect(res.replacements).toHaveLength(2)
    for (const r of res.replacements) {
      expect(text.slice(r.start, r.end)).toBe(r.before)
      expect(res.output.slice(r.outStart, r.outEnd)).toBe(r.after)
    }
  })
})

describe('ner token mapping', () => {
  it('groups word pieces into entities with offsets', () => {
    const text = "I work at Barclays with Tom O'Neill in Leeds."
    const tokens = [
      { entity: 'O', score: 0.99, word: 'I' },
      { entity: 'O', score: 0.99, word: 'work' },
      { entity: 'O', score: 0.99, word: 'at' },
      { entity: 'B-ORG', score: 0.99, word: 'Barclay' },
      { entity: 'I-ORG', score: 0.99, word: '##s' },
      { entity: 'O', score: 0.99, word: 'with' },
      { entity: 'B-PER', score: 0.99, word: 'Tom' },
      { entity: 'I-PER', score: 0.99, word: 'O' },
      { entity: 'I-PER', score: 0.99, word: "'" },
      { entity: 'I-PER', score: 0.99, word: 'Neill' },
      { entity: 'O', score: 0.99, word: 'in' },
      { entity: 'B-LOC', score: 0.99, word: 'Leeds' },
      { entity: 'O', score: 0.99, word: '.' }
    ]
    const spans = tokensToSpans(text, tokens)
    expect(spans.map((s) => `${s.type}:${s.text}`)).toEqual([
      'ORG:Barclays',
      "PERSON:Tom O'Neill",
      'LOCATION:Leeds'
    ])
    for (const s of spans) expect(text.slice(s.start, s.end)).toBe(s.text)
  })
  it('chunks long text with offsets', () => {
    const text = 'Sentence one. '.repeat(200)
    const chunks = chunkText(text, 300)
    expect(chunks.map((c) => c.text).join('')).toBe(text)
    for (const c of chunks) expect(text.slice(c.offset, c.offset + c.text.length)).toBe(c.text)
  })
})

describe('json paths', () => {
  it('matches exact paths and wildcards', () => {
    expect(pathMatches('users[*].email', 'users[*].email')).toBe(true)
    expect(pathMatches('users[*].contact.email', '**.email')).toBe(true)
    expect(pathMatches('email', '**.email')).toBe(true)
    expect(pathMatches('users[*].contact.email', 'users[*].*.email')).toBe(true)
    expect(pathMatches('users[*].emailVerified', '**.email')).toBe(false)
  })
  it('collects leaves with general paths', () => {
    const leaves = collectLeaves({ users: [{ name: 'A', 'odd key': 1 }] })
    expect(leaves.map((l) => l.general)).toEqual(['users[*].name', 'users[*]["odd key"]'])
    expect(leaves.map((l) => l.path)).toEqual(['users[0].name', 'users[0]["odd key"]'])
  })
})

describe('engine', () => {
  const csv =
    'first_name,last_name,email,notes\nSarah,Jenkins,sarah.jenkins@gmail.com,Called on 07700 900123\nTom,Hughes,tom.h@yahoo.co.uk,\n'

  it('round-trips CSV', () => {
    const t = parseCsv(csv)
    expect(serialiseCsv(t)).toBe(csv)
  })

  it('suggests rules from names and values', () => {
    const profile = profileTable(parseCsv(csv), lib)
    expect(profile.map((p) => p.suggestion?.type)).toEqual([
      'FIRST_NAME',
      'LAST_NAME',
      'EMAIL',
      'GENERIC'
    ])
    expect(profile[3].suggestion?.action).toBe('scan')
  })

  it('anonymises a table coherently and records changes', async () => {
    const t = parseCsv(csv)
    const mapper = new Mapper('k', lib)
    const scan = async (texts: string[]): Promise<ReturnType<typeof mergeSpans>[]> =>
      texts.map((x) => mergeSpans(detectRules(x, { library: lib })))
    const { output, changes } = await runTable(
      t,
      [
        { field: 'first_name', action: 'fake', type: 'FIRST_NAME' },
        { field: 'last_name', action: 'fake', type: 'LAST_NAME' },
        { field: 'email', action: 'fake', type: 'EMAIL' },
        { field: 'notes', action: 'scan', type: 'GENERIC' }
      ],
      { mapper, scan }
    )
    const [f, l, e, n] = output.rows[0]
    expect(f).not.toBe('Sarah')
    expect(e.startsWith(`${f.toLowerCase()}.${l.toLowerCase().replace("'", '')}@`)).toBe(true)
    expect(n).toMatch(/^Called on 07700 900\d{3}$/)
    expect(n).not.toBe('Called on 07700 900123')
    expect(changes.length).toBe(7)
    expect(t.rows[0][0]).toBe('Sarah') // original untouched
  })

  it('anonymises JSON by path, keeping numbers as numbers', async () => {
    const j = parseJson(
      JSON.stringify({ users: [{ name: 'Sarah Jenkins', age: 40, card: 4111111111111111 }] })
    )
    const { output, changes } = await runJson(
      j,
      [
        { field: '**.name', action: 'fake', type: 'PERSON' },
        { field: 'users[*].card', action: 'fake', type: 'CARD' }
      ],
      { mapper: new Mapper('k', lib), scan: noScan }
    )
    const u = (output.value as { users: { name: string; age: number; card: number }[] }).users[0]
    expect(u.name).not.toBe('Sarah Jenkins')
    expect(u.age).toBe(40)
    expect(typeof u.card).toBe('number')
    expect(luhnValid(String(u.card))).toBe(true)
    expect(changes.map((c) => c.path)).toEqual(['users[0].name', 'users[0].card'])
  })
})
