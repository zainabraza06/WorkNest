import { User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyToken } from '../utils/jwt.js';

function extractToken(req) {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

export async function resolveUser(token) {
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw ApiError.unauthorized('Account not found or disabled');
  // Tokens issued before tokenVersion existed carry no `tv`; they count as version 0, so the
  // rollout does not sign anyone out, but the first password change revokes them.
  if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) throw ApiError.unauthorized('Session expired, please sign in again');
  return user;
}

/** Requires a valid Bearer token; sets req.user. */
export async function requireAuth(req, _res, next) {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized();
  req.user = await resolveUser(token);
  next();
}

/** Sets req.user if a valid token is present, otherwise continues anonymously. */
export async function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = await resolveUser(token);
    } catch {
      req.user = undefined;
    }
  }
  next();
}

/** Must be used after requireAuth. */
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user?.role)) {
      throw ApiError.forbidden(`This action is only available to: ${roles.join(', ')}`);
    }
    next();
  };
