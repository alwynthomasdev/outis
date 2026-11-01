// Downloads the NER model used for free-text detection into resources/models.
// Run once on a machine with internet access (developer machine or CI).
// The packaged app never downloads anything: it only reads these files.
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const MODEL_ID = process.env.OUTIS_MODEL_ID || 'Xenova/bert-base-NER'
const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'vocab.txt',
  'onnx/model_quantized.onnx'
]

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'resources', 'models', ...MODEL_ID.split('/'))

for (const file of FILES) {
  const target = join(outDir, file)
  if (existsSync(target) && statSync(target).size > 0) {
    console.log(`✓ ${file} (already present)`)
    continue
  }
  mkdirSync(dirname(target), { recursive: true })
  const url = `https://huggingface.co/${MODEL_ID}/resolve/main/${file}`
  process.stdout.write(`↓ ${file} ... `)
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Failed to download ${url}: ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(target))
  console.log(`${(statSync(target).size / 1e6).toFixed(1)} MB`)
}
console.log(`Model ready in ${outDir}`)
