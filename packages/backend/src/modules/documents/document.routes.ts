import { Router, type IRouter } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, type AuthenticatedRequest } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  listDocumentsSchema,
  getDocumentSchema,
  deleteDocumentSchema,
} from '@lifeos/shared';
import { ValidationError } from '../../lib/errors.js';
import * as docController from './document.controller.js';

const uploadDir = path.resolve(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.txt', '.md'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new ValidationError(`Unsupported file type '${ext}'. Allowed types: .pdf, .txt, .md`));
    }
  },
});

const router: IRouter = Router();

// All document routes require authentication
router.use(authenticate);

router.post(
  '/',
  upload.single('file'),
  (req, res, next) => docController.upload(req as AuthenticatedRequest, res, next),
);

router.post(
  '/:id/versions',
  upload.single('file'),
  (req, res, next) => docController.reupload(req as AuthenticatedRequest, res, next),
);

router.get(
  '/',
  validate(listDocumentsSchema),
  (req, res, next) => docController.list(req as AuthenticatedRequest, res, next),
);

router.get(
  '/:id',
  validate(getDocumentSchema),
  (req, res, next) => docController.getById(req as AuthenticatedRequest, res, next),
);

router.delete(
  '/:id',
  validate(deleteDocumentSchema),
  (req, res, next) => docController.remove(req as AuthenticatedRequest, res, next),
);

router.get(
  '/:id/chunks',
  validate(getDocumentSchema),
  (req, res, next) => docController.getChunks(req as AuthenticatedRequest, res, next),
);

export { router as documentRouter };
