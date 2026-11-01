// Prints the CHANGELOG.md section for a version, for use as GitHub release notes.
// Usage: node scripts/release-notes.mjs 0.2.0
import { readFileSync } from 'node:fs'

const version = process.argv[2]
if (!version) throw new Error('Usage: release-notes.mjs <version>')

const lines = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split(/\r?\n/)
const start = lines.findIndex((l) => l.startsWith(`## [${version}]`))
if (start === -1) throw new Error(`No "## [${version}]" section in CHANGELOG.md`)
let end = lines.findIndex((l, i) => i > start && (l.startsWith('## [') || /^\[[^\]]+\]: /.test(l)))
if (end === -1) end = lines.length
const section = lines
  .slice(start + 1, end)
  .join('\n')
  .trim()

console.log(`${section}

---

**Downloads:** \`Outis-${version}-setup.exe\` (installer) or \`Outis-${version}-portable.exe\` (no install needed).
These builds are not code-signed, so Windows SmartScreen may warn on first run: choose **More info → Run anyway**.
Outis works fully offline. The ML model is included.`)
