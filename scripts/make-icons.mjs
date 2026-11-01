// Builds the app icons from build/icon.svg: build/icon.png, icon.ico, icon.icns and resources/icon.png.
// Run with `npm run icons` after editing the SVG.
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'build/icon.svg'))
const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer()

// ICO with PNG-compressed entries (supported since Windows Vista).
async function ico(sizes) {
  const images = await Promise.all(sizes.map(png))
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach((img, i) => {
    const e = 6 + 16 * i
    header.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], e)
    header.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], e + 1)
    header.writeUInt16LE(1, e + 4)
    header.writeUInt16LE(32, e + 6)
    header.writeUInt32LE(img.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += img.length
  })
  return Buffer.concat([header, ...images])
}

// ICNS with PNG entries.
async function icns() {
  const types = [
    ['icp4', 16],
    ['icp5', 32],
    ['icp6', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024]
  ]
  const chunks = await Promise.all(
    types.map(async ([type, size]) => {
      const data = await png(size)
      const head = Buffer.alloc(8)
      head.write(type, 0, 'ascii')
      head.writeUInt32BE(data.length + 8, 4)
      return Buffer.concat([head, data])
    })
  )
  const body = Buffer.concat(chunks)
  const head = Buffer.alloc(8)
  head.write('icns', 0, 'ascii')
  head.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([head, body])
}

writeFileSync(join(root, 'build/icon.png'), await png(1024))
writeFileSync(join(root, 'resources/icon.png'), await png(512))
writeFileSync(join(root, 'build/icon.ico'), await ico([16, 24, 32, 48, 64, 128, 256]))
writeFileSync(join(root, 'build/icon.icns'), await icns())
console.log('Icons written to build/ and resources/')
