const express = require('express');
const multer = require('multer');
const { admin } = require('../firebase');
const { generateId } = require('../controllers/BaseController');

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images, documents, and common file types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|mp4|mov|avi/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, documents, and videos are allowed.'));
    }
  }
});

// Initialize Firebase Storage
const bucket = admin.storage().bucket();

// Ensure bucket exists
async function ensureBucketExists() {
  try {
    const [exists] = await bucket.exists();
    if (!exists) {
      console.log('Creating default storage bucket...');
      await bucket.create();
      console.log('Default storage bucket created successfully');
    }
  } catch (error) {
    console.error('Error checking/creating bucket:', error);
  }
}

// Initialize bucket on startup
ensureBucketExists();

// POST /api/upload - Upload a single file
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    // Extract + normalize fields
    const file = req.file;
    const {
      folder = 'uploads',
      isPublic: isPublicRaw = false,
      entityType: entityTypeRaw = 'general', // 'venues', 'productions', 'users', 'general'
      entityId: entityIdRaw = null,
    } = req.body;

    const isPublic = parseBool(isPublicRaw);
    const entityType = entityTypeRaw || 'general';
    const entityId = entityIdRaw || null;

    // Validate entity type to avoid arbitrary path writes
    if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
      return res.status(400).json({ success: false, error: 'Invalid entityType' });
    }

    // Generate a stable internal id for tracking (even if we use entityId for filename)
    const internalId = generateId();

    // Derive extension: prefer original name; fall back to mimetype
    const origExt = file.originalname.includes('.') ? file.originalname.split('.').pop() : '';
    const mimeExt = mime.extension(file.mimetype) || '';
    const ext = sanitizeSegment((origExt || mimeExt || 'bin').toLowerCase());

    const filePath = buildStoragePath({
      entityType: entityId ? entityType : null,
      entityId: entityId || null,
      folder,
      fileId: internalId,
      ext,
    });

    const gcsFile = bucket.file(filePath);

    // Guard against overwrite if using entityId path
    if (entityId && !shouldAllowOverwrite(req)) {
      const [exists] = await gcsFile.exists();
      if (exists) {
        return res.status(409).json({
          success: false,
          error: 'File already exists for this entity. Set allowOverwrite=true to replace.',
          path: filePath,
        });
      }
    }

    // Helpful headers
    const cacheControl = isPublic ? 'public, max-age=31536000, immutable' : 'private, max-age=0, no-cache';
    const contentDisposition = `inline; filename="${file.originalname.replace(/"/g, '')}"`;

    // Save buffer (simpler than manual createWriteStream)
    await gcsFile.save(file.buffer, {
      resumable: false,
      metadata: {
        contentType: file.mimetype,
        cacheControl,
        contentDisposition,
        metadata: {
          originalName: file.originalname,
          uploadedAt: new Date().toISOString(),
          uploadedBy: (req.user?.uid || req.body.userId || 'anonymous'),
          entityType,
          entityId: entityId || '',
          internalId,
        },
      },
    });

    // Toggle public ACL if requested
    if (isPublic) {
      await gcsFile.makePublic();
    }

    // Build URL: public uses durable URL; private gets a signed URL (v4)
    let url;
    if (isPublic) {
      url = `https://storage.googleapis.com/${bucket.name}/${encodeURI(filePath)}`;
    } else {
      const [signedUrl] = await gcsFile.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      url = signedUrl;
    }

    return res.json({
      success: true,
      file: {
        id: internalId, // always present and traceable
        entityId: entityId || null,
        entityType,
        originalName: file.originalname,
        fileName: filePath.split('/').pop(),
        path: filePath,
        url,
        size: file.size,
        mimeType: file.mimetype,
        folder: entityId ? undefined : folder, // folder only relevant for non-entity uploads
        public: isPublic,
        uploadedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to upload file',
      message: err?.message || 'Unknown error',
    });
  }
});

// POST /api/upload/multiple - Upload multiple files
router.post('/multiple', upload.array('files', 10), async (req, res) => {
  console.log('Upload request body:', req.body);
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files provided'
      });
    }

    const {
      folder = 'uploads',
      isPublic = false,
      entityType = 'general', // venues, productions, users, etc.
      entityId = null // specific ID for the entity
    } = req.body;
    const uploadedFiles = [];

    for (const file of req.files) {
      try {
        // Generate unique filename
        const fileId = generateId();
        const fileExtension = file.originalname.split('.').pop();
        const fileName = `${fileId}.${fileExtension}`;

        // Create structured path based on entity type
        let filePath;
        if (entityType && entityId) {
          // Structured path: entityType/entityId/filename
          filePath = `${entityType}/${entityId}/${fileName}`;
        } else {
          // Fallback to simple folder structure
          filePath = `${folder}/${fileName}`;
        }

        // Upload to Firebase Storage
        const fileUpload = bucket.file(filePath);
        const stream = fileUpload.createWriteStream({
          metadata: {
            contentType: file.mimetype,
            metadata: {
              originalName: file.originalname,
              uploadedAt: new Date().toISOString(),
              uploadedBy: req.body.userId || 'anonymous'
            }
          }
        });

        await new Promise((resolve, reject) => {
          stream.on('error', reject);
          stream.on('finish', resolve);
          stream.end(file.buffer);
        });

        // Make file public if requested
        if (isPublic === 'true' || isPublic === true) {
          await fileUpload.makePublic();
        }

        // Get file URL
        const fileUrl = isPublic === 'true' || isPublic === true
          ? `https://storage.googleapis.com/${bucket.name}/${filePath}`
          : await fileUpload.getSignedUrl({
              action: 'read',
              expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
            });

        uploadedFiles.push({
          id: fileId,
          name: file.originalname,
          fileName: fileName,
          path: filePath,
          url: Array.isArray(fileUrl) ? fileUrl[0] : fileUrl,
          size: file.size,
          mimeType: file.mimetype,
          folder: folder,
          public: isPublic === 'true' || isPublic === true,
          uploadedAt: new Date().toISOString()
        });

      } catch (fileError) {
        console.error(`Error uploading file ${file.originalname}:`, fileError);
        uploadedFiles.push({
          name: file.originalname,
          error: fileError.message
        });
      }
    }

    res.json({
      success: true,
      files: uploadedFiles,
      total: uploadedFiles.length
    });

  } catch (error) {
    console.error('Multiple upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload files',
      message: error.message
    });
  }
});

// GET /api/upload/:fileId - Get file information
router.get('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { folder = 'uploads' } = req.query;

    const filePath = `${folder}/${fileId}`;
    const file = bucket.file(filePath);

    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    const [metadata] = await file.getMetadata();
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      file: {
        id: fileId,
        name: metadata.metadata?.originalName || fileId,
        path: filePath,
        url: signedUrl,
        size: parseInt(metadata.size),
        mimeType: metadata.contentType,
        folder: folder,
        uploadedAt: metadata.metadata?.uploadedAt,
        uploadedBy: metadata.metadata?.uploadedBy
      }
    });

  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get file information',
      message: error.message
    });
  }
});

// DELETE /api/upload/:fileId - Delete file
router.delete('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { folder = 'uploads' } = req.query;

    const filePath = `${folder}/${fileId}`;
    const file = bucket.file(filePath);

    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    await file.delete();

    res.json({
      success: true,
      message: 'File deleted successfully',
      fileId: fileId,
      path: filePath
    });

  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete file',
      message: error.message
    });
  }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 10MB.'
      });
    }
  }

  if (error.message === 'Invalid file type. Only images, documents, and videos are allowed.') {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }

  res.status(500).json({
    success: false,
    error: 'Upload error',
    message: error.message
  });
});

module.exports = router;
