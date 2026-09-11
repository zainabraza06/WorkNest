import { ClientProfile, User, WorkerProfile } from '../models/index.js';
import { ROLES } from '../constants/index.js';
import { ApiError } from '../utils/ApiError.js';
import { signToken } from '../utils/jwt.js';

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
  if (!user || !(await user.comparePassword(password))) {
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
  await user.save();

  res.json({ success: true, data: { token: signToken(user) } });
}
