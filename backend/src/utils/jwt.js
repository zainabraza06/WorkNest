import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role, tv: user.tokenVersion ?? 0 }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

export function verifyToken(token) {
  // Pinned: never let a token choose how it is verified (alg confusion, "none")
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
}
