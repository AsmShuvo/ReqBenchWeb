import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

export interface TokenPayload {
  userId: string
  email: string
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET missing or too short (need >= 16 chars). Set it in server/.env.')
  }
  return secret
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, jwtSecret(), { expiresIn: TOKEN_TTL_SECONDS })
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, jwtSecret()) as jwt.JwtPayload
    if (decoded.userId && decoded.email) {
      return { userId: String(decoded.userId), email: String(decoded.email) }
    }
    return null
  } catch {
    return null
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  const payload = verifyToken(header.slice(7).trim())
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }
  req.user = payload
  next()
}

export function isValidEmail(email: string): boolean {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
