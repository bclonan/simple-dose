import { fileURLToPath } from 'node:url'
import type { FullConfig } from '@playwright/test'
import { createServer, type ViteDevServer } from 'vite'

/** Own the Vite instance directly. Windows webServer shell cleanup can hang. */
export default async function startTestServer(config: FullConfig): Promise<() => Promise<void>> {
  const baseUrl = new URL(config.projects[0]!.use.baseURL!)
  if (baseUrl.protocol !== 'http:' || baseUrl.hostname !== '127.0.0.1' || !baseUrl.port) {
    throw new Error('The local browser tests require an explicit loopback HTTP port.')
  }
  const previousMode = process.env.VITE_CLEARDose_DATA_MODE
  process.env.VITE_CLEARDose_DATA_MODE = 'demo'
  const restoreMode = () => {
    if (previousMode === undefined) delete process.env.VITE_CLEARDose_DATA_MODE
    else process.env.VITE_CLEARDose_DATA_MODE = previousMode
  }
  let server: ViteDevServer | undefined
  try {
    server = await createServer({
      root: fileURLToPath(new URL('../../', import.meta.url)),
      server: { host: baseUrl.hostname, port: Number(baseUrl.port), strictPort: true },
    })
    await server.listen()
  } catch (error) {
    try { await server?.close() }
    finally { restoreMode() }
    throw error
  }
  return async () => {
    try { await server!.close() }
    finally { restoreMode() }
  }
}
