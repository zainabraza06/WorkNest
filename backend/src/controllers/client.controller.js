import { ClientProfile } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { toPoint } from '../validators/common.js';

function toModelFields(body) {
  const { location, ...rest } = body;
  return location ? { ...rest, location: toPoint(location) } : rest;
}

export async function getMyProfile(req, res) {
  const profile = await ClientProfile.findOne({ user: req.user._id });
  res.json({ success: true, data: profile });
}

export async function createProfile(req, res) {
  if (await ClientProfile.exists({ user: req.user._id })) {
    throw ApiError.conflict('Client profile already exists — use PATCH to update it');
  }
  const profile = await ClientProfile.create({ ...toModelFields(req.valid.body), user: req.user._id });
  res.status(201).json({ success: true, data: profile });
}

export async function updateProfile(req, res) {
  const profile = await ClientProfile.findOne({ user: req.user._id });
  if (!profile) throw ApiError.notFound('Create your client profile first');
  profile.set(toModelFields(req.valid.body));
  await profile.save();
  res.json({ success: true, data: profile });
}

/** What a worker sees about a client they are negotiating with. No exact address or coordinates. */
export async function getPublicProfile(req, res) {
  const { userId } = req.valid.params;
  const profile = await ClientProfile.findOne({ user: userId })
    .select('user city about stats createdAt')
    .populate('user', 'name avatar createdAt');
  if (!profile) throw ApiError.notFound('Client not found');
  res.json({ success: true, data: profile });
}
