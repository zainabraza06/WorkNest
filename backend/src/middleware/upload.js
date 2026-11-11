import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DOCUMENT_TYPES = [...IMAGE_TYPES, 'application/pdf'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// multer's `mimetype` is just the Content-Type header the client chose. Check the real leading bytes.
const SIGNATURES = {
  'image/jpeg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  'application/pdf': (b) => b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-',
};

/** True when the file's content matches the type it claims to be. */
export const matchesDeclaredType = (file) => Boolean(file?.buffer && SIGNATURES[file.mimetype]?.(file.buffer));

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
    if (err) return next(err);
    const files = req.files ? Object.values(req.files).flat() : [];
    if (req.file) files.push(req.file);
    if (files.some((f) => !matchesDeclaredType(f))) {
      return next(ApiError.badRequest('The file contents do not match its declared type'));
    }
    next();
  });

export const uploadSingleImage = (field) => wrap(images.single(field));
export const uploadImages = (field, max) => wrap(images.array(field, max));
export const uploadDocument = (field) => wrap(documents.single(field));
