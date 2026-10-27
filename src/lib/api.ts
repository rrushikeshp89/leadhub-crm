export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: Record<string, unknown>) { super(message) }
  /** Field-level messages, e.g. { name: 'Company name is required' } */
  get fields(): Record<string, string> {
    const d = this.details ?? {}
    return Object.fromEntries(Object.entries(d).filter(([, v]) => typeof v === 'string')) as Record<string, string>
  }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check that the API is running.')
  }
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; details?: Record<string, unknown> }
    throw new ApiError(res.status, d.error ?? `Request failed (${res.status})`, d.details)
  }
  return data as T
}

export const get = <T>(p: string) => api<T>('GET', p)
export const post = <T>(p: string, b: unknown = {}) => api<T>('POST', p, b)
export const patch = <T>(p: string, b: unknown) => api<T>('PATCH', p, b)
export const del = <T>(p: string) => api<T>('DELETE', p)
