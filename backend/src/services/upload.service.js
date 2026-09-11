import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';
import { ApiError } from '../utils/ApiError.js';

function assertConfigured() {
  if (!isCloudinaryConfigured) {
    throw new ApiError(503, 'Image uploads are not configured on this server (missing Cloudinary credentials)');
  }
}

/**
 * Uploads an in-memory file buffer to Cloudinary.
 * @param {Buffer} buffer
 * @param {{ folder: string, private?: boolean, transformation?: object[] }} options
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export function uploadBuffer(buffer, { folder, private: isPrivate = false, transformation } = {}) {
  assertConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `worknest/${folder}`,
        resource_type: 'auto',
        // ID documents are stored as "authenticated" assets: URLs need a signature to view
        type: isPrivate ? 'authenticated' : 'upload',
        transformation,
      },
      (error, result) => {
        if (error) return reject(new ApiError(502, `Upload failed: ${error.message}`));
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
}

export async function deleteAsset(publicId, { private: isPrivate = false } = {}) {
  if (!publicId || !isCloudinaryConfigured) return;
  try {
    await cloudinary.uploader.destroy(publicId, { type: isPrivate ? 'authenticated' : 'upload' });
  } catch (err) {
    // Orphaned assets are not worth failing a user request over
    console.warn(`Failed to delete Cloudinary asset ${publicId}:`, err.message);
  }
}

/** Short-lived signed URL for viewing a private (authenticated) asset. */
export function signedUrl(publicId, ttlSeconds = 300) {
  assertConfigured();
  return cloudinary.url(publicId, {
    type: 'authenticated',
    sign_url: true,
    secure: true,
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
}

export const IMAGE_TRANSFORMS = {
  avatar: [{ width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto', fetch_format: 'auto' }],
  portfolio: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
};
