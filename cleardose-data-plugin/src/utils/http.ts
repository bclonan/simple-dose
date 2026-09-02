export interface HttpOptions {
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
    public readonly body?: string
  ) {
    super(message);
  }
}

export async function getJson<T>(
  url: string,
  params: Record<string, string | number | boolean | undefined> = {},
  options: HttpOptions = {}
): Promise<T> {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') target.searchParams.set(key, String(value));
  }

  const retries = options.retries ?? 1;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    options.signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
    try {
      const response = await fetch(target, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new HttpError(`${response.status} ${response.statusText}`, response.status, target.toString(), body);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      const permanent = error instanceof HttpError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
      if (attempt === retries || permanent || options.signal?.aborted || error instanceof SyntaxError) throw error;
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  throw lastError;
}
