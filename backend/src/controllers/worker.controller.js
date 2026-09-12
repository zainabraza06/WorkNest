import { Review, WorkerProfile } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { toPoint } from '../validators/common.js';
import { deleteAsset, IMAGE_TRANSFORMS, signedUrl, uploadBuffer } from '../services/upload.service.js';
import { refreshTrustScore } from '../services/trust.service.js';

const MAX_PORTFOLIO = 12;
const PUBLIC_USER_FIELDS = 'name avatar createdAt';

function toModelFields(body) {
  const { location, ...rest } = body;
  return location ? { ...rest, location: toPoint(location) } : rest;
}

async function getOwnProfile(userId) {
  const profile = await WorkerProfile.findOne({ user: userId });
  if (!profile) throw ApiError.notFound('Create your worker profile first');
  return profile;
}

/** Strips private fields (ID document) before sending a profile to anyone but its owner. */
function publicView(profile) {
  const json = profile.toJSON();
  json.idVerified = json.idVerification?.status === 'verified';
  delete json.idVerification;
  return json;
}

export async function getMyProfile(req, res) {
  const profile = await WorkerProfile.findOne({ user: req.user._id });
  res.json({ success: true, data: profile });
}

export async function createProfile(req, res) {
  if (await WorkerProfile.exists({ user: req.user._id })) {
    throw ApiError.conflict('Worker profile already exists — use PATCH to update it');
  }
  const profile = await WorkerProfile.create({ ...toModelFields(req.valid.body), user: req.user._id });
  await refreshTrustScore(req.user._id);

  // Re-read so the response carries the freshly computed trust score
  res.status(201).json({ success: true, data: await WorkerProfile.findById(profile._id) });
}

export async function updateProfile(req, res) {
  const profile = await getOwnProfile(req.user._id);
  profile.set(toModelFields(req.valid.body));
  await profile.save();
  res.json({ success: true, data: profile });
}

export async function getPublicProfile(req, res) {
  const { userId } = req.valid.params;
  const profile = await WorkerProfile.findOne({ user: userId }).populate('user', PUBLIC_USER_FIELDS);
  if (!profile) throw ApiError.notFound('Worker not found');

  const recentReviews = await Review.find({ to: userId })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('from', 'name avatar');

  res.json({ success: true, data: { ...publicView(profile), recentReviews } });
}

export async function addPortfolioImages(req, res) {
  const files = req.files ?? [];
  if (!files.length) throw ApiError.badRequest('Attach at least one image in the "images" field');

  const profile = await getOwnProfile(req.user._id);
  if (profile.portfolio.length + files.length > MAX_PORTFOLIO) {
    throw ApiError.badRequest(`Portfolio is limited to ${MAX_PORTFOLIO} images (you have ${profile.portfolio.length})`);
  }

  const { captions } = req.valid.body;
  const uploaded = await Promise.all(
    files.map((f) => uploadBuffer(f.buffer, { folder: 'portfolio', transformation: IMAGE_TRANSFORMS.portfolio })),
  );
  uploaded.forEach((img, i) => profile.portfolio.push({ ...img, caption: captions[i]?.slice(0, 140) }));
  await profile.save();

  res.status(201).json({ success: true, data: profile.portfolio });
}

export async function removePortfolioImage(req, res) {
  const profile = await getOwnProfile(req.user._id);
  const image = profile.portfolio.id(req.valid.params.imageId);
  if (!image) throw ApiError.notFound('Image not found');

  const { publicId } = image;
  image.deleteOne();
  await profile.save();
  await deleteAsset(publicId);

  res.json({ success: true, data: profile.portfolio });
}

export async function submitIdVerification(req, res) {
  if (!req.file) throw ApiError.badRequest('Attach your ID document in the "document" field');

  const profile = await getOwnProfile(req.user._id);
  if (profile.idVerification?.status === 'verified') {
    throw ApiError.conflict('Your ID is already verified');
  }

  const previous = profile.idVerification?.document?.publicId;
  const document = await uploadBuffer(req.file.buffer, { folder: 'id-documents', private: true });

  profile.idVerification = { status: 'pending', document, submittedAt: new Date() };
  await profile.save();
  await deleteAsset(previous, { private: true });

  res.status(201).json({ success: true, data: { status: 'pending', submittedAt: profile.idVerification.submittedAt } });
}

/** Admin: view a pending ID document via a short-lived signed URL, then approve or reject. */
export async function getIdDocument(req, res) {
  const profile = await WorkerProfile.findOne({ user: req.valid.params.userId });
  const publicId = profile?.idVerification?.document?.publicId;
  if (!publicId) throw ApiError.notFound('No ID document submitted');
  res.json({ success: true, data: { url: signedUrl(publicId), status: profile.idVerification.status } });
}

export async function decideIdVerification(req, res) {
  const profile = await WorkerProfile.findOne({ user: req.valid.params.userId });
  if (!profile?.idVerification?.document?.publicId) throw ApiError.notFound('No ID document submitted');

  profile.idVerification.status = req.valid.body.status;
  profile.idVerification.reviewedAt = new Date();
  await profile.save();
  // Verification is a Trust Score input, so rescore immediately
  await refreshTrustScore(profile.user);

  res.json({ success: true, data: { status: profile.idVerification.status } });
}
