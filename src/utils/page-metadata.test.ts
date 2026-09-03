import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it } from 'vitest'
import { projectLinks } from '../content/project'
import { updatePageMetadata } from './page-metadata'

const file = (path: string) => readFileSync(resolve(process.cwd(), path))
const source = (path: string) => file(path).toString('utf8')
const staticPage = () => new DOMParser().parseFromString(source('index.html'), 'text/html')
const value = (key: string, property = false) => document.head.querySelector<HTMLMetaElement>(`meta[${property ? 'property' : 'name'}="${key}"]`)?.content

describe('page metadata', () => {
  beforeEach(() => { document.head.innerHTML = staticPage().head.innerHTML })

  it('keeps static home metadata in sync with client updates and preserves unrelated tags', () => {
    const original = staticPage()
    const custom = document.createElement('meta')
    custom.name = 'test-project-tag'
    custom.content = 'Retained'
    document.head.append(custom)
    updatePageMetadata('/')
    expect(document.title).toBe(original.title)
    for (const meta of original.head.querySelectorAll<HTMLMetaElement>('meta[name],meta[property]')) {
      const property = meta.hasAttribute('property')
      const key = meta.getAttribute(property ? 'property' : 'name')!
      expect(value(key, property)).toBe(meta.content)
    }
    expect(value('test-project-tag')).toBe('Retained')
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${projectLinks.liveUrl}/`)
  })

  it('updates documentation and hackathon tags without duplicating them', () => {
    updatePageMetadata('/webmcp')
    expect(document.title).toBe('WebMCP tools and examples | ClearDose')
    expect(value('description')).toContain('live schemas')
    expect(value('og:url', true)).toBe(`${projectLinks.liveUrl}/webmcp`)
    updatePageMetadata('/hackathon/')
    expect(document.title).toBe('The ClearDose WebMCP project | Hackathon overview')
    expect(value('og:title', true)).toBe(document.title)
    expect(value('twitter:title')).toBe(document.title)
    expect(value('og:url', true)).toBe(`${projectLinks.liveUrl}/hackathon`)
    expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1)
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1)
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
  })

  it('never includes user selections, order identifiers, or arbitrary origins in sharing metadata', () => {
    updatePageMetadata('/drugs/explore?drugs=private-selection&facts=warnings#personal-note')
    expect(value('og:url', true)).toBe(`${projectLinks.liveUrl}/drugs/explore`)
    expect(document.head.innerHTML).not.toContain('private-selection')
    expect(document.head.innerHTML).not.toContain('personal-note')
    for (const path of ['/orders/CD-private-123', 'https://untrusted.example/path', '/__proto__']) {
      updatePageMetadata(path)
      expect(value('og:url', true)).toBe(`${projectLinks.liveUrl}/`)
      expect(document.head.innerHTML).not.toContain('CD-private-123')
      expect(document.head.innerHTML).not.toContain('untrusted.example')
    }
    updatePageMetadata('/medications/public-drug-name')
    expect(value('og:url', true)).toBe(`${projectLinks.liveUrl}/medications`)
  })

  it('creates missing metadata safely when the document starts with no sharing tags', () => {
    document.head.innerHTML = ''
    updatePageMetadata('/webmcp')
    expect(value('application-name')).toBe('ClearDose')
    expect(value('theme-color')).toBe('#102a43')
    expect(value('twitter:card')).toBe('summary_large_image')
    expect(value('og:image', true)).toBe(`${projectLinks.liveUrl}/og-image.png`)
    expect(value('og:image:width', true)).toBe('1200')
    expect(value('og:image:height', true)).toBe('630')
  })
})

function expectPng(bytes: Buffer, width: number, height: number): void {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(bytes.subarray(12, 16).toString()).toBe('IHDR')
  expect(bytes.readUInt32BE(16)).toBe(width)
  expect(bytes.readUInt32BE(20)).toBe(height)
}

describe('published brand assets and license', () => {
  it('ships the required PNG dimensions and a real multi-frame ICO directory', () => {
    for (const [name, width, height] of [['apple-touch-icon.png', 180, 180], ['og-image.png', 1200, 630], ['icon-192.png', 192, 192], ['icon-512.png', 512, 512]] as const) {
      const bytes = file(`public/${name}`)
      expectPng(bytes, width, height)
      expect(bytes.length).toBeLessThan(180_000)
    }
    const ico = file('public/favicon.ico')
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(3)
    for (const [index, size] of [16, 32, 48].entries()) {
      const position = 6 + index * 16
      expect(ico[position]).toBe(size)
      expect(ico[position + 1]).toBe(size)
      const length = ico.readUInt32LE(position + 8)
      const offset = ico.readUInt32LE(position + 12)
      expect(offset + length).toBeLessThanOrEqual(ico.length)
      expectPng(ico.subarray(offset, offset + length), size, size)
    }
  })

  it('uses the existing header mark and palette rather than a different logo', () => {
    const headerPaths = [...source('src/components/AppHeader.vue').matchAll(/<path d="([^"]+)"/g)].slice(0, 2).map(match => match[1])
    for (const name of ['favicon.svg', 'og-image.svg']) {
      const svg = source(`public/${name}`)
      for (const path of headerPaths) expect(svg).toContain(`d="${path}"`)
      expect(svg).toContain('#0d7067')
    }
    expect(source('src/styles/main.css')).toContain('--cd-teal-dark: #0d7067')
  })

  it('references existing assets with correct format metadata and manifest dimensions', () => {
    const page = staticPage()
    for (const link of page.querySelectorAll<HTMLLinkElement>('link[rel="icon"],link[rel="apple-touch-icon"],link[rel="manifest"]')) {
      expect(file(`public${link.getAttribute('href')}`).length).toBeGreaterThan(0)
    }
    expect(page.querySelector('link[type="image/svg+xml"]')?.getAttribute('href')).toBe('/favicon.svg')
    expect(page.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('sizes')).toBe('180x180')
    expect(page.querySelector('meta[property="og:image:type"]')?.getAttribute('content')).toBe('image/png')
    const manifest = JSON.parse(source('public/site.webmanifest')) as { name: string; start_url: string; icons: Array<{ src: string; sizes: string; type: string }> }
    expect(manifest.name).toBe('ClearDose')
    expect(manifest.start_url).toBe('/')
    for (const icon of manifest.icons) {
      const size = Number(icon.sizes.split('x')[0])
      expect(icon.type).toBe('image/png')
      expectPng(file(`public${icon.src}`), size, size)
    }
  })

  it('publishes the identical MIT license in the repository and static site', () => {
    expect(file('public/LICENSE.txt')).toEqual(file('LICENSE'))
    expect(source('LICENSE')).toContain('MIT License')
    expect(source('LICENSE')).toContain('Permission is hereby granted, free of charge')
  })
})
