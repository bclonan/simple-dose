import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Assets are committed. Regeneration is optional and accepts an already-installed sharp module path.
const sharp = createRequire(import.meta.url)(process.argv[2] || 'sharp')
const asset = name => new URL(`../public/${name}`, import.meta.url)
const mark = await readFile(asset('favicon.svg'))
for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  await sharp(mark).resize(size, size).png({ compressionLevel: 9, palette: true }).toFile(fileURLToPath(asset(name)))
}
await sharp(await readFile(asset('og-image.svg'))).png({ compressionLevel: 9, palette: true }).toFile(fileURLToPath(asset('og-image.png')))

// ICO directory with three PNG-compressed image entries, not a renamed PNG file.
const sizes = [16, 32, 48]
const frames = await Promise.all(sizes.map(size => sharp(mark).resize(size, size).png({ compressionLevel: 9 }).toBuffer()))
const header = Buffer.alloc(6 + 16 * frames.length)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(frames.length, 4)
let offset = header.length
frames.forEach((frame, index) => {
  const entry = 6 + index * 16
  header[entry] = sizes[index]
  header[entry + 1] = sizes[index]
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(frame.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += frame.length
})
await writeFile(asset('favicon.ico'), Buffer.concat([header, ...frames]))
