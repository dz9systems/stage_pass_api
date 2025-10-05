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
      return res.status(400).json({
        success: false,
        error: 'No file provided'
      });
    }
    const file = req.file;
    const {
      folder = 'uploads',
      isPublic = false,
      entityType = 'general', // venues, productions, users, etc.
      entityId = null // specific ID for the entity
    } = req.body;

    // Generate filename - use entity ID if provided, otherwise generate unique ID
    const fileExtension = file.originalname.split('.').pop();
    let fileName;
    let filePath;
    
    if (entityType && entityId) {
      // Use entity ID as filename for structured paths
      fileName = `${entityId}.${fileExtension}`;
      filePath = `${entityType}/${entityId}/${fileName}`;
    } else {
      // Generate unique ID for general uploads
      const fileId = generateId();
      console.log('Generated file ID:', fileId);
      fileName = `${fileId}.${fileExtension}`;
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

    stream.on('error', (error) => {
      console.error('Upload error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to upload file'
      });
    });

    stream.on('finish', async () => {
      try {
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

        res.json({
          success: true,
          file: {
            id: entityId || generateId(), // Use entity ID if available, otherwise generate one
            name: file.originalname,
            fileName: fileName,
            path: filePath,
            url: Array.isArray(fileUrl) ? fileUrl[0] : fileUrl,
            size: file.size,
            mimeType: file.mimetype,
            folder: entityType || folder,
            public: isPublic === 'true' || isPublic === true,
            uploadedAt: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error('Error getting file URL:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get file URL'
        });
      }
    });

    stream.end(file.buffer);

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload file',
      message: error.message
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
        // Generate filename - use entity ID if provided, otherwise generate unique ID
        const fileExtension = file.originalname.split('.').pop();
        let fileName;
        let filePath;
        
        if (entityType && entityId) {
          // Use entity ID as filename for structured paths
          fileName = `${entityId}.${fileExtension}`;
          filePath = `${entityType}/${entityId}/${fileName}`;
        } else {
          // Generate unique ID for general uploads
          const fileId = generateId();
          fileName = `${fileId}.${fileExtension}`;
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
