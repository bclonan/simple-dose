import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const origin = new URL(process.argv[2] || 'https://cleardose-webmcp-demo.netlify.app').origin
if (!/^https:\/\/(?:[a-f0-9]+--)?cleardose-webmcp-demo\.netlify\.app$/.test(origin)) throw new Error('Use the existing ClearDose site or its immutable Netlify deploy URL.')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const files = ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'og-image.png', 'og-image.svg', 'icon-192.png', 'icon-512.png', 'site.webmanifest', 'LICENSE.txt']
const results = await Promise.all(files.map(async file => {
  const response = await fetch(`${origin}/${file}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const local = await readFile(new URL(`../dist/${file}`, import.meta.url))
  if (!response.ok || digest(bytes) !== digest(local)) throw new Error(`${file} differs from the tested build or did not load: ${response.status}`)
  if (file === 'site.webmanifest' && !response.headers.get('content-type')?.includes('application/manifest+json')) throw new Error('Manifest must be served as application/manifest+json.')
  return { path: `/${file}`, status: response.status, contentType: response.headers.get('content-type'), bytes: bytes.length, sha256: digest(bytes), matchesBuild: true }
}))
for (const route of ['/webmcp', '/hackathon']) {
  const response = await fetch(`${origin}${route}`)
  const html = await response.text()
  const local = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')
  const localModule = local.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1]
  if (!response.ok || !localModule || !html.includes(localModule)) throw new Error(`${route} is not serving the tested application shell.`)
  if (!html.includes('/og-image.png') || !html.includes('/favicon.ico') || !html.includes('name="twitter:card"')) throw new Error(`${route} lacks required sharing metadata.`)
  if (!response.headers.get('content-security-policy')?.includes('frame-src https://www.youtube-nocookie.com')) throw new Error(`${route} lacks the narrow video frame policy.`)
  results.push({ path: route, status: response.status, contentType: response.headers.get('content-type'), matchesBuild: true, module: localModule })
}
console.log(JSON.stringify({ origin, checkedAt: new Date().toISOString(), results }, null, 2))
