export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

let _token: string | null = null
let _onUnauthorized: (() => void) | null = null

export function setToken(token: string | null): void {
  _token = token
}

export function setUnauthorizedHandler(handler: () => void): void {
  _onUnauthorized = handler
}

// Single-flight refresh: concurrent 401s share one POST /auth/refresh.
let _refreshPromise: Promise<string | null> | null = null

function refreshAccessToken(): Promise<string | null> {
  if (!_refreshPromise) {
    _refreshPromise = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
        if (!res.ok) return null
        const data = (await res.json()) as { access_token?: string }
        return data.access_token ?? null
      } catch {
        return null
      } finally {
        _refreshPromise = null
      }
    })()
  }
  return _refreshPromise
}

/**
 * A validation error location for people: ["body", "exercises", 0, "sets", 1, "rpe"]
 * → "exercise 1 › set 2 › rpe". Drops the leading "body"; a list index joins the
 * (singular) name before it and counts from 1.
 */
function formatErrorLoc(loc: unknown): string {
  if (!Array.isArray(loc)) return ''
  const parts = loc[0] === 'body' ? loc.slice(1) : loc
  const out: string[] = []
  for (const part of parts) {
    const prev = out[out.length - 1]
    if (typeof part === 'number' && prev !== undefined && !/\d$/.test(prev)) {
      out[out.length - 1] = `${prev.replace(/s$/, '')} ${part + 1}`
    } else {
      out.push(typeof part === 'number' ? String(part + 1) : String(part))
    }
  }
  return out.join(' › ')
}

/**
 * FastAPI `detail` as text: a string as is; a validation error list (422) as
 * "where: msg" entries joined, not "[object Object]".
 */
export function formatErrorDetail(detail: unknown): string {
  if (detail == null || detail === '') return 'Request failed'
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const msgs = detail.map((d) => {
      if (!d || typeof d !== 'object' || !('msg' in d)) return String(d)
      const { msg, loc } = d as { msg: unknown; loc?: unknown }
      const where = formatErrorLoc(loc)
      return where ? `${where}: ${String(msg)}` : String(msg)
    })
    return msgs.length > 0 ? msgs.join('; ') : 'Request failed'
  }
  return JSON.stringify(detail)
}

function send(method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (_token) headers['Authorization'] = `Bearer ${_token}`
  return fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res = await send(method, path, body)

  // Expired access token: refresh once and retry once. /auth/* 401s (wrong
  // password, failed mount-time refresh) are passed through untouched.
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      setToken(newToken)
      res = await send(method, path, body)
    }
  }

  if (res.status === 401) {
    _onUnauthorized?.()
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>
    const message = formatErrorDetail(err['detail'])
    console.error(`[api] ${method} ${path} → ${res.status}:`, message, err)
    throw new ApiError(message, res.status, err)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
