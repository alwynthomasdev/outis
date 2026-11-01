// JSON property paths.
// Generalised paths use [*] for any array index: users[*].contact.email
// Patterns may also use * (any one key) and ** (any depth): **.email, users[*].*.phone

const SIMPLE_KEY = /^[A-Za-z_$][\w$]*$/

export function keySegment(key: string, first: boolean): string {
  if (SIMPLE_KEY.test(key)) return first ? key : `.${key}`
  return `[${JSON.stringify(key)}]`
}

export interface Leaf {
  /** Concrete path, e.g. users[3].email */
  path: string
  /** Generalised path, e.g. users[*].email */
  general: string
  value: string | number
  /** Set the leaf to a new value in the document. */
  set: (v: string | number) => void
}

/** Walk a JSON value and return every string or number leaf. */
export function collectLeaves(root: unknown): Leaf[] {
  const leaves: Leaf[] = []
  const walk = (node: unknown, path: string, general: string, set: (v: unknown) => void): void => {
    if (typeof node === 'string' || typeof node === 'number') {
      leaves.push({ path, general, value: node, set })
      return
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) =>
        walk(child, `${path}[${i}]`, `${general}[*]`, (v) => (node[i] = v))
      )
      return
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>
      for (const key of Object.keys(obj)) {
        const seg = keySegment(key, path === '')
        walk(obj[key], path + seg, general + seg, (v) => (obj[key] = v))
      }
    }
  }
  walk(root, '', '', () => {})
  return leaves
}

const patternCache = new Map<string, RegExp>()

/** Convert a path pattern to a regular expression. */
export function patternToRegex(pattern: string): RegExp {
  const cached = patternCache.get(pattern)
  if (cached) return cached
  let re = ''
  let i = 0
  while (i < pattern.length) {
    if (pattern.startsWith('**.', i)) {
      re += '(?:.*[.\\]])?'
      i += 3
    } else if (pattern.startsWith('**', i)) {
      re += '.*'
      i += 2
    } else if (pattern.startsWith('[*]', i)) {
      re += '\\[\\*\\]'
      i += 3
    } else if (pattern[i] === '*') {
      re += '[^.\\[]+'
      i += 1
    } else {
      re += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      i += 1
    }
  }
  const out = new RegExp(`^${re}$`)
  patternCache.set(pattern, out)
  return out
}

export function pathMatches(general: string, pattern: string): boolean {
  if (general === pattern) return true
  if (!pattern.includes('*')) return false
  return patternToRegex(pattern).test(general)
}
