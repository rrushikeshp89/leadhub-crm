import type { NextFunction, Request, Response } from 'express'

/** Content Security Policy for the built client: own scripts only, Google Fonts, remote images (avatars, logos) */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

export function securityHeaders({ hsts }: { hsts: boolean }) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Content-Security-Policy', CSP)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
    // Only over HTTPS: browsers then refuse plain HTTP for this host for 180 days
    if (hsts) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
    next()
  }
}

/** One JSON line per request; no query strings, bodies or cookies (they can hold personal data) */
export function requestLog() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api/health') return next()
    // Captured now: routers mounted under /api rewrite req.path while handling the request
    const path = req.path
    const start = process.hrtime.bigint()
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6
      console.log(JSON.stringify({ t: new Date().toISOString(), method: req.method, path, status: res.statusCode, ms: Math.round(ms) }))
    })
    next()
  }
}
