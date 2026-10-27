import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import type { User } from '../shared/model'
import type { Repo } from './repo'

const COOKIE = 'lh_sid'
const SESSION_DAYS = 7

export function hashPassword(pw: string) {
  const salt = randomBytes(16)
  const hash = scryptSync(pw, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(pw: string, stored: string | null | undefined) {
  if (!stored) return false
  const [alg, saltHex, hashHex] = stored.split('$')
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(expected, actual)
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

type DbUser = User & { passwordHash: string | null }

/** Strip secrets; expose whether the account can sign in */
export function publicUser(u: DbUser | undefined): User | undefined {
  if (!u) return undefined
  const { passwordHash, ...rest } = u
  return { ...rest, canLogin: !!passwordHash }
}

export function createSession(repo: Repo, res: Response, userId: string) {
  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000)
  repo.db.prepare('INSERT INTO sessions (tokenHash, userId, expiresAt, createdAt) VALUES (?, ?, ?, ?)')
    .run(sha(token), userId, expires.toISOString(), new Date().toISOString())
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true', expires, path: '/',
  })
}

export function destroySession(repo: Repo, req: Request, res: Response) {
  const token = readCookie(req)
  if (token) repo.db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(sha(token))
  res.clearCookie(COOKIE, { path: '/' })
}

function readCookie(req: Request): string | undefined {
  const raw = req.headers.cookie
  if (!raw) return undefined
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE) return decodeURIComponent(v.join('='))
  }
  return undefined
}

declare module 'express-serve-static-core' {
  interface Request { user?: User }
}

export function sessionMiddleware(repo: Repo) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = readCookie(req)
    if (token) {
      const row = repo.db.prepare(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.userId WHERE s.tokenHash = ? AND s.expiresAt > ?`,
      ).get(sha(token), new Date().toISOString()) as DbUser | undefined
      if (row) req.user = publicUser(row)
    }
    next()
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in' })
  next()
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Only admins can do this' })
  next()
}

/** Owners and admins may delete/reassign records */
export const canManage = (user: User | undefined, ownerId: string | null | undefined) =>
  !!user && (user.role === 'admin' || !ownerId || ownerId === user.id)
