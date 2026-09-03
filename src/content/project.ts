export const projectLinks = {
  liveUrl: 'https://cleardose-webmcp-demo.netlify.app',
  repositoryUrl: 'https://github.com/bclonan/simple-dose',
  youtubeUrl: '',
} as const

export const projectReadiness = {
  repositoryPublicVerifiedOn: '2026-09-03',
  sourceReleasePublished: false,
  license: 'MIT',
  placeholders: { live: '[LIVE_URL]', repository: '[REPOSITORY_URL]', youtube: '[YOUTUBE_URL]' },
} as const

export function youtubeEmbedUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    const host = url.hostname.toLowerCase()
    let id: string | null = null
    if (host === 'youtu.be') id = url.pathname.slice(1)
    else if (['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v')
      else if (url.pathname.startsWith('/embed/')) id = url.pathname.slice(7)
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null
  } catch { return null }
}
