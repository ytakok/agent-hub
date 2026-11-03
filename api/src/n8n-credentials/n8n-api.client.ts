/**
 * Minimal client for the n8n public API (Settings → n8n API in n8n creates the key).
 * Only the two calls the importer needs; listing credentials is not available on every n8n version.
 */
export interface N8nCreatedCredential {
  id: string;
  name: string;
  type: string;
}

export interface N8nCredentialSchema {
  required?: string[];
  properties?: Record<string, unknown>;
}

export class N8nApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'N8nApiError';
  }
}

type FetchFn = typeof fetch;

export class N8nApiClient {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {
    this.base = baseUrl.replace(/\/+$/, '');
  }

  /** Link that opens the credential in the n8n editor. */
  credentialUrl(id: string): string {
    return `${this.base}/home/credentials/${encodeURIComponent(id)}`;
  }

  getSchema(type: string): Promise<N8nCredentialSchema> {
    return this.request<N8nCredentialSchema>('GET', `/credentials/schema/${encodeURIComponent(type)}`);
  }

  createCredential(input: {
    name: string;
    type: string;
    data: Record<string, string>;
  }): Promise<N8nCreatedCredential> {
    return this.request<N8nCreatedCredential>('POST', '/credentials', input);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.base}/api/v1${path}`, {
        method,
        headers: {
          'X-N8N-API-KEY': this.apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new N8nApiError(0, `Could not reach n8n (${e instanceof Error ? e.name : 'network error'}).`);
    }
    if (!res.ok) throw new N8nApiError(res.status, await errorMessage(res));
    return (await res.json()) as T;
  }
}

/** n8n explains validation failures in `message` (field names, never the values sent). Kept short. */
async function errorMessage(res: Response): Promise<string> {
  const fallback = res.status === 401 ? 'n8n rejected the API key.' : `n8n answered ${res.status}.`;
  try {
    const body = (await res.json()) as { message?: unknown };
    return typeof body.message === 'string' && body.message ? body.message.slice(0, 300) : fallback;
  } catch {
    return fallback;
  }
}
