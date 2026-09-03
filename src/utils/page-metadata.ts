import { projectLinks } from '../content/project'

const home = {
  title: 'ClearDose | Transparent prescriptions. Agent-ready.',
  description: 'Compare public medication references and fictional pharmacy offers in one shared interface for people and WebMCP browser agents.',
}
const pages: Record<string, { title: string; description: string }> = {
  '/': home,
  '/webmcp': {
    title: 'WebMCP tools and examples | ClearDose',
    description: 'Explore ClearDose browser tools, live schemas, copyable prompts, and chained workflows that update the same visible application state.',
  },
  '/hackathon': {
    title: 'The ClearDose WebMCP project | Hackathon overview',
    description: 'See the ClearDose WebMCP use case, shared Vue and Pinia architecture, demo workflow, source repository, and submission readiness.',
  },
  '/medications': { title: 'Medication catalog | ClearDose', description: 'Search public medication records and inspect sources. Fictional pharmacy offers stay separate from public drug facts.' },
  '/drugs/explore': { title: 'Medication comparison report | ClearDose', description: 'Compare selected medication facts side by side, review FDA label sources and public benchmarks, and prepare questions for a pharmacist or clinician.' },
  '/compare': { title: 'Compare fictional pharmacy offers | ClearDose', description: 'Compare fictional delivered totals for the same exact medication, strength, form, and quantity. ClearDose does not provide real pharmacy quotes.' },
  '/prescription-card': { title: 'Demo prescription request card | ClearDose', description: 'Review a local demonstration request summary. ClearDose does not issue or transmit prescriptions.' },
  '/checkout': { title: 'Simulated checkout | ClearDose', description: 'Review a fictional ClearDose order. No real payment, prescription, or pharmacy order is transmitted.' },
}

function setMeta(key: string, value: string, property = false): void {
  const attribute = property ? 'property' : 'name'
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute(attribute, key)
    document.head.append(meta)
  }
  meta.content = value
}

/** Route metadata never copies query values, order IDs, or source text into public sharing tags. */
export function updatePageMetadata(path: string): void {
  if (typeof document === 'undefined') return
  const pathname = path.split(/[?#]/, 1)[0]?.replace(/\/+$/, '') || '/'
  const canonicalPath = Object.hasOwn(pages, pathname) ? pathname : pathname.startsWith('/medications/') ? '/medications' : '/'
  const page = pages[canonicalPath] ?? home
  const url = new URL(canonicalPath, projectLinks.liveUrl).href
  const image = new URL('/og-image.png', projectLinks.liveUrl).href
  document.title = page.title
  setMeta('description', page.description)
  setMeta('application-name', 'ClearDose')
  setMeta('theme-color', '#102a43')
  setMeta('og:site_name', 'ClearDose', true)
  setMeta('og:type', 'website', true)
  setMeta('og:title', page.title, true)
  setMeta('og:description', page.description, true)
  setMeta('og:url', url, true)
  setMeta('og:image', image, true)
  setMeta('og:image:type', 'image/png', true)
  setMeta('og:image:width', '1200', true)
  setMeta('og:image:height', '630', true)
  setMeta('og:image:alt', 'ClearDose. Public medication references and fictional pharmacy offers in one shared human and agent interface.', true)
  setMeta('twitter:card', 'summary_large_image')
  setMeta('twitter:title', page.title)
  setMeta('twitter:description', page.description)
  setMeta('twitter:image', image)
  setMeta('twitter:image:alt', 'ClearDose medication reference and WebMCP demonstration')
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.rel = 'canonical'
    document.head.append(canonical)
  }
  canonical.href = url
}
