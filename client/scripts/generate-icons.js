import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const INPUT = resolve(__dirname, '../public/logo.svg')
const OUTPUT_DIR = resolve(__dirname, '../public/icons')

const SIZES = [48, 72, 96, 128, 144, 192, 384, 512]

mkdirSync(OUTPUT_DIR, { recursive: true })

for (const size of SIZES) {
  // Regular icon (purpose: "any")
  await sharp(INPUT)
    .resize(size, size)
    .png()
    .toFile(resolve(OUTPUT_DIR, `icon-${size}x${size}.png`))

  // Maskable icon: 10% padding on each side for Android adaptive icon safe zone
  const padding = Math.round(size * 0.1)
  const innerSize = size - padding * 2

  await sharp(INPUT)
    .resize(innerSize, innerSize)
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: '#072818',
    })
    .png()
    .toFile(resolve(OUTPUT_DIR, `icon-${size}x${size}-maskable.png`))
}

console.log(`Generated ${SIZES.length * 2} icons in public/icons/`)
