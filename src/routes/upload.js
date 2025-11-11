const express = require('express');
const multer = require('multer');
const mime = require('mime-types');
const { admin } = require('../firebase');
const { generateId } = require('../controllers/BaseController');

const router = express.Router();

// Constants
const ALLOWED_ENTITY_TYPES = new Set(['venues', 'productions', 'users', 'general']);
const ALLOWED_CATEGORIES = new Set(['venue_images', 'production_images', 'settings_images']);

// Helper functions
function parseBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1';
  }
  return Boolean(value);
}

function sanitizeSegment(segment) {
  return segment.replace(/[^a-zA-Z0-9._-]/g, '');
}

function buildStoragePath({ entityType, entityId, folder, fileId, ext, category, userId, relatedEntityId, fileName }) {
  // New structure: users/{userId}/{category}/{relatedEntityId if needed}/{fileName}
  if (category && userId) {
    const sanitizedUserId = sanitizeSegment(userId);
    const sanitizedCategory = sanitizeSegment(category);
    
    if (category === 'settings_images') {
      // Fixed filename for settings_images: avatar.{ext}
      return `users/${sanitizedUserId}/${sanitizedCategory}/avatar.${ext}`;
    } else if (relatedEntityId && fileName) {
      // venue_images or production_images with relatedEntityId and fileName
      const sanitizedRelatedId = sanitizeSegment(relatedEntityId);
      const sanitizedFileName = sanitizeSegment(fileName);
      // Ensure fileName has extension, if not use provided ext
      const finalFileName = sanitizedFileName.includes('.') ? sanitizedFileName : `${sanitizedFileName}.${ext}`;
      return `users/${sanitizedUserId}/${sanitizedCategory}/${sanitizedRelatedId}/${finalFileName}`;
    }
  }
  
  // Legacy structure: entityType/entityId/fileId.ext or folder/fileId.ext
  if (entityType && entityId) {
    return `${entityType}/${entityId}/${fileId}.${ext}`;
  }
  return `${folder}/${fileId}.${ext}`;
}

function shouldAllowOverwrite(req) {
  return parseBool(req.body.allowOverwrite) || parseBool(req.query.allowOverwrite);
}

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
      await bucket.create();
    }
  } catch (error) {
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
      isPublic: isPublicRaw,
      entityType: entityTypeRaw = 'general', // 'venues', 'productions', 'users', 'general'
      entityId: entityIdRaw = null,
      // New parameters for user image structure
      category: categoryRaw = null,
      userId: userIdRaw = null,
      relatedEntityId: relatedEntityIdRaw = null,
      fileName: fileNameRaw = null
    } = req.body;

    const entityType = entityTypeRaw || 'general';
    const entityId = entityIdRaw || null;
    const category = categoryRaw || null;
    const userId = userIdRaw || null;
    const relatedEntityId = relatedEntityIdRaw || null;
    const fileName = fileNameRaw || null;

    // Determine if using new structure
    const usingNewStructure = category && userId;

    // For new structure (user images), default to public if not explicitly set
    // Images are meant to be publicly accessible (storage rules allow public read)
    let isPublic;
    if (usingNewStructure) {
      // If isPublicRaw is explicitly provided (not null/undefined/empty), use it
      // Otherwise default to true for user images
      if (isPublicRaw !== null && isPublicRaw !== undefined && isPublicRaw !== '') {
        isPublic = parseBool(isPublicRaw);
      } else {
        // Default to public for user images if not specified
        isPublic = true;
      }
    } else {
      // Legacy structure: default to false if not specified
      isPublic = parseBool(isPublicRaw);
    }

    // Validate category if using new structure
    if (usingNewStructure) {
      if (!ALLOWED_CATEGORIES.has(category)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid category. Must be one of: venue_images, production_images, settings_images' 
        });
      }

      // Validate required fields based on category
      if (category === 'venue_images' || category === 'production_images') {
        if (!relatedEntityId) {
          return res.status(400).json({ 
            success: false, 
            error: `relatedEntityId is required for ${category}` 
          });
        }
        if (!fileName) {
          return res.status(400).json({ 
            success: false, 
            error: `fileName is required for ${category}` 
          });
        }
      }
      // settings_images doesn't require relatedEntityId or fileName (uses fixed name)
    } else {
      // Legacy structure validation
      if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
        return res.status(400).json({ success: false, error: 'Invalid entityType' });
      }
    }

    // Generate a stable internal id for tracking
    const internalId = generateId();

    // Derive extension: prefer original name; fall back to mimetype
    const origExt = file.originalname.includes('.') ? file.originalname.split('.').pop() : '';
    const mimeExt = mime.extension(file.mimetype) || '';
    const ext = sanitizeSegment((origExt || mimeExt || 'bin').toLowerCase());

    // Build file path based on structure
    const filePath = buildStoragePath({
      entityType: entityId ? entityType : null,
      entityId: entityId || null,
      folder,
      fileId: internalId,
      ext,
      category,
      userId,
      relatedEntityId,
      fileName,
    });

    const gcsFile = bucket.file(filePath);

    // Handle overwrite logic
    if (usingNewStructure) {
      // For settings_images, always allow overwrite (single file per user)
      if (category === 'settings_images') {
        // No check needed, will overwrite
      } else {
        // For venue_images and production_images, allow overwrite by default
        // but check if file exists and allowOverwrite is false
        if (!shouldAllowOverwrite(req)) {
          const [exists] = await gcsFile.exists();
          if (exists) {
            return res.status(409).json({
              success: false,
              error: 'File already exists. Set allowOverwrite=true to replace.',
              path: filePath,
            });
          }
        }
      }
    } else {
      // Legacy: Guard against overwrite if using entityId path
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
    }

    // Helpful headers
    const cacheControl = isPublic
      ? 'public, max-age=31536000, immutable'
      : 'private, max-age=0, no-cache';
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
          uploadedBy: (req.user?.uid || userId || req.body.userId || 'anonymous'),
          entityType: usingNewStructure ? 'users' : entityType,
          entityId: usingNewStructure ? userId : (entityId || ''),
          category: category || '',
          relatedEntityId: relatedEntityId || '',
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
      try {
        const [signedUrl] = await gcsFile.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        });
        url = signedUrl;
      } catch (signError) {
        // Fallback to public URL if signed URL generation fails
        // In production, you should ensure credentials are properly configured
        url = `https://storage.googleapis.com/${bucket.name}/${encodeURI(filePath)}`;
      }
    }

    return res.json({
      success: true,
      file: {
        id: internalId, // always present and traceable
        entityId: usingNewStructure ? userId : (entityId || null),
        entityType: usingNewStructure ? 'users' : entityType,
        category: category || null,
        relatedEntityId: relatedEntityId || null,
        originalName: file.originalname,
        fileName: filePath.split('/').pop(),
        path: filePath,
        url,
        size: file.size,
        mimeType: file.mimetype,
        folder: usingNewStructure ? undefined : (entityId ? undefined : folder), // folder only relevant for non-entity uploads
        public: isPublic,
        uploadedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to upload file',
      message: err?.message || 'Unknown error',
    });
  }
});

// POST /api/upload/multiple - Upload multiple files
router.post('/multiple', upload.array('files', 10), async (req, res) => {
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
    res.status(500).json({
      success: false,
      error: 'Failed to upload files',
      message: error.message
    });
  }
});

// GET /api/upload - List files by entity or folder
router.get('/', async (req, res) => {
  try {
    const {
      folder = 'uploads',
      entityType,
      entityId,
      limit = 50,
      offset = 0
    } = req.query;

    let prefix = folder;
    if (entityType && entityId) {
      prefix = `${entityType}/${entityId}`;
    }

    const [files] = await bucket.getFiles({
      prefix,
      maxResults: parseInt(limit),
      pageToken: offset > 0 ? `offset-${offset}` : undefined
    });

    const fileList = await Promise.all(
      files.map(async (file) => {
        try {
          const [metadata] = await file.getMetadata();
          let signedUrl;
          try {
            [signedUrl] = await file.getSignedUrl({
              action: 'read',
              expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
            });
          } catch (signError) {
            // Fallback to public URL if available
            const isPublic = metadata.acl?.some(acl => acl.entity === 'allUsers');
            signedUrl = isPublic 
              ? `https://storage.googleapis.com/${bucket.name}/${encodeURI(file.name)}`
              : null;
          }

          return {
            id: file.name.split('/').pop().split('.')[0],
            name: metadata.metadata?.originalName || file.name.split('/').pop(),
            fileName: file.name.split('/').pop(),
            path: file.name,
            url: signedUrl,
            size: parseInt(metadata.size),
            mimeType: metadata.contentType,
            folder: entityType ? undefined : folder,
            entityType: entityType || undefined,
            entityId: entityId || undefined,
            public: metadata.acl?.some(acl => acl.entity === 'allUsers'),
            uploadedAt: metadata.metadata?.uploadedAt,
            uploadedBy: metadata.metadata?.uploadedBy
          };
        } catch (error) {
          return null;
        }
      })
    );

    // Filter out null results
    const validFiles = fileList.filter(file => file !== null);

    res.json({
      success: true,
      files: validFiles,
      total: validFiles.length,
      folder,
      entityType,
      entityId
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to list files',
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
    let signedUrl;
    try {
      [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
      });
    } catch (signError) {
      // Fallback to public URL if available
      const isPublic = metadata.acl?.some(acl => acl.entity === 'allUsers');
      signedUrl = isPublic 
        ? `https://storage.googleapis.com/${bucket.name}/${encodeURI(filePath)}`
        : null;
      if (!signedUrl) {
        return res.status(500).json({
          success: false,
          error: 'Failed to generate file URL. Configure Firebase credentials for private file access.'
        });
      }
    }

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
