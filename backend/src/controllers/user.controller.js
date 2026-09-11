import { User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { deleteAsset, IMAGE_TRANSFORMS, uploadBuffer } from '../services/upload.service.js';

export async function updateMe(req, res) {
  const user = await User.findByIdAndUpdate(req.user._id, req.valid.body, { returnDocument: 'after', runValidators: true });
  res.json({ success: true, data: user });
}

export async function uploadAvatar(req, res) {
  if (!req.file) throw ApiError.badRequest('Attach an image in the "avatar" field');

  const user = await User.findById(req.user._id);
  const previous = user.avatar?.publicId;
  user.avatar = await uploadBuffer(req.file.buffer, { folder: 'avatars', transformation: IMAGE_TRANSFORMS.avatar });
  await user.save();
  await deleteAsset(previous);

  res.json({ success: true, data: user });
}
