import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DOCUMENT_TYPES = [...IMAGE_TYPES, 'application/pdf'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function build(allowedTypes) {
  return multer({
    storage: multer.memoryStorage(), // buffers go straight to Cloudinary, nothing touches disk
    limits: { fileSize: MAX_FILE_BYTES, files: 6 },
    fileFilter: (_req, file, cb) => {
      if (allowedTypes.includes(file.mimetype)) return cb(null, true);
      cb(ApiError.badRequest(`Unsupported file type ${file.mimetype}. Allowed: ${allowedTypes.join(', ')}`));
    },
  });
}

const images = build(IMAGE_TYPES);
const documents = build(DOCUMENT_TYPES);

/** Converts multer's own errors into clean 400 responses. */
const wrap = (mw) => (req, res, next) =>
  mw(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'File too large (max 5 MB)'
          : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
            ? 'Too many files or unexpected field name'
            : err.message;
      return next(ApiError.badRequest(message));
    }
    next(err);
  });

export const uploadSingleImage = (field) => wrap(images.single(field));
export const uploadImages = (field, max) => wrap(images.array(field, max));
export const uploadDocument = (field) => wrap(documents.single(field));
