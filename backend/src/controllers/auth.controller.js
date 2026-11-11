import bcrypt from 'bcryptjs';

import { ClientProfile, User, WorkerProfile } from '../models/index.js';
import { ROLES } from '../constants/index.js';
import { ApiError } from '../utils/ApiError.js';
import { signToken } from '../utils/jwt.js';
import { disconnectUserSockets } from '../socket/index.js';

// A real bcrypt hash to compare against when the email is unknown, so "no such account" costs the
// same ~100 ms as "wrong password". Without it the response time reveals which emails are registered,
// however identical the error message is. Computed once, on first use.
let dummyHash;
const getDummyHash = () => (dummyHash ??= bcrypt.hash('timing-equaliser-not-a-real-password', 12));

async function findProfile(user) {
  if (user.role === ROLES.WORKER) return WorkerProfile.findOne({ user: user._id });
  if (user.role === ROLES.CLIENT) return ClientProfile.findOne({ user: user._id });
  return null;
}

export async function register(req, res) {
  const { email } = req.valid.body;

  if (await User.exists({ email })) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const user = await User.create(req.valid.body);

  res.status(201).json({
    success: true,
    data: { token: signToken(user), user, profile: null },
  });
}

export async function login(req, res) {
  const { email, password } = req.valid.body;

  const user = await User.findOne({ email }).select('+password');
  // Same message for unknown email and wrong password — don't leak which accounts exist
  const passwordOk = user ? await user.comparePassword(password) : await bcrypt.compare(password, await getDummyHash());
  if (!user || !passwordOk) {
    throw ApiError.unauthorized('Incorrect email or password');
  }
  if (!user.isActive) throw ApiError.forbidden('This account has been disabled');

  user.lastLoginAt = new Date();
  await user.save();

  res.json({
    success: true,
    data: { token: signToken(user), user, profile: await findProfile(user) },
  });
}

export async function me(req, res) {
  res.json({
    success: true,
    data: { user: req.user, profile: await findProfile(req.user) },
  });
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.valid.body;
  const user = await User.findById(req.user._id).select('+password');

  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  user.password = newPassword;
  user.tokenVersion += 1; // a changed password must kill every session an attacker may hold
  await user.save();
  disconnectUserSockets(user._id.toString()); // ...including live sockets; the client reconnects with its new token

  res.json({ success: true, data: { token: signToken(user) } });
}

/** "Sign out everywhere": invalidates every token issued so far, on every device. */
export async function logoutAll(req, res) {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  disconnectUserSockets(req.user._id.toString());
  res.json({ success: true, data: { loggedOut: true } });
}
