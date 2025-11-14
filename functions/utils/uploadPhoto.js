const { admin } = require('../firebase');

// UPLOAD PHOTO TO FIREBASE STORAGE
// Supports category-based file paths:
// - production_images/{productionId}/{fileName}
// - settings_images/{fileName}
// - venue_images/{venueId}/{fileName}
// - seatmap_images/{venueId}/{fileName}
const uploadPhoto = async ({ fileName, uid, uri, category, relatedEntityId }) => {
  try {
    // GET THE STORAGE BUCKET
    const bucket = admin.storage().bucket();

    // BUILD FILE PATH BASED ON CATEGORY
    let filePath;
    
    if (category) {
      // Validate category
      const validCategories = ['production_images', 'settings_images', 'venue_images', 'seatmap_images'];
      if (!validCategories.includes(category)) {
        throw new Error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
      }

      // Build path based on category
      switch (category) {
        case 'production_images':
          if (!relatedEntityId) {
            throw new Error('relatedEntityId (productionId) is required for production_images category');
          }
          filePath = `users/${uid}/production_images/${relatedEntityId}/${fileName}`;
          break;
        
        case 'venue_images':
          if (!relatedEntityId) {
            throw new Error('relatedEntityId (venueId) is required for venue_images category');
          }
          filePath = `users/${uid}/venue_images/${relatedEntityId}/${fileName}`;
          break;
        
        case 'seatmap_images':
          if (!relatedEntityId) {
            throw new Error('relatedEntityId (venueId) is required for seatmap_images category');
          }
          filePath = `users/${uid}/seatmap_images/${relatedEntityId}/${fileName}`;
          break;
        
        case 'settings_images':
          // For settings_images, we don't need relatedEntityId
          filePath = `users/${uid}/settings_images/${fileName}`;
          break;
        
        default:
          filePath = `users/${uid}/${fileName}`;
      }
    } else {
      // LEGACY: If no category provided, use simple path for backward compatibility
      filePath = `users/${uid}/${fileName}`;
    }

    const file = bucket.file(filePath);

    // FETCH THE PHOTO DATA FROM THE PROVIDED URI
    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // DETERMINE CONTENT TYPE FROM RESPONSE OR FILE EXTENSION
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // UPLOAD THE FILE TO THE STORAGE BUCKET
    await file.save(buffer, {
      metadata: {
        contentType: contentType,
        cacheControl: 'public, max-age=31536000',
      },
    });

    // MAKE FILE PUBLIC
    await file.makePublic();

    // GET DOWNLOAD URL (PUBLIC URL)
    const downloadURL = `https://storage.googleapis.com/${bucket.name}/${encodeURI(filePath)}`;

    // RETURN THE DOWNLOAD URL
    return downloadURL;
  } catch (error) {
    console.error('Error uploading photo:', error);
    throw error; // Re-throw so callers can handle it
  }
};

// GET PHOTO URL FROM STORAGE
// Constructs the download URL for an already uploaded photo
// Supports the same category-based file paths as uploadPhoto
const getPhotoUrl = async ({ fileName, uid, category, relatedEntityId }) => {
  try {
    // GET THE STORAGE BUCKET
    const bucket = admin.storage().bucket();

    // BUILD FILE PATH BASED ON CATEGORY
    let filePath;
    
    if (category) {
      // Validate category
      const validCategories = ['production_images', 'settings_images', 'venue_images', 'seatmap_images'];
      if (!validCategories.includes(category)) {
        throw new Error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
      }

      // Build path based on category
      switch (category) {
        case 'production_images':
          if (!relatedEntityId) {
            throw new Error('relatedEntityId (productionId) is required for production_images category');
          }
          if (!fileName) {
            throw new Error('fileName is required');
          }
          filePath = `users/${uid}/production_images/${relatedEntityId}/${fileName}`;
          break;
        
        case 'venue_images':
          if (!relatedEntityId) {
            throw new Error('relatedEntityId (venueId) is required for venue_images category');
          }
          if (!fileName) {
            throw new Error('fileName is required');
          }
          filePath = `users/${uid}/venue_images/${relatedEntityId}/${fileName}`;
          break;
        
        case 'seatmap_images':
          if (!relatedEntityId) {
            throw new Error('relatedEntityId (venueId) is required for seatmap_images category');
          }
          // If fileName is not provided, list all files in the directory
          if (!fileName) {
            const prefix = `users/${uid}/seatmap_images/${relatedEntityId}/`;
            const [files] = await bucket.getFiles({ prefix });
            const fileList = files.map(file => {
              const fileName = file.name.split('/').pop();
              return {
                fileName,
                url: `https://storage.googleapis.com/${bucket.name}/${encodeURI(file.name)}`
              };
            });
            return fileList;
          }
          filePath = `users/${uid}/seatmap_images/${relatedEntityId}/${fileName}`;
          break;
        
        case 'settings_images':
          if (!fileName) {
            throw new Error('fileName is required');
          }
          filePath = `users/${uid}/settings_images/${fileName}`;
          break;
        
        default:
          if (!fileName) {
            throw new Error('fileName is required');
          }
          filePath = `users/${uid}/${fileName}`;
      }
    } else {
      if (!fileName) {
        throw new Error('fileName is required');
      }
      filePath = `users/${uid}/${fileName}`;
    }

    // GET DOWNLOAD URL (PUBLIC URL)
    const downloadURL = `https://storage.googleapis.com/${bucket.name}/${encodeURI(filePath)}`;

    // RETURN THE DOWNLOAD URL
    return downloadURL;
  } catch (error) {
    console.error('Error getting photo URL:', error);
    throw error; // Re-throw so callers can handle it
  }
};

module.exports = { uploadPhoto, getPhotoUrl };

