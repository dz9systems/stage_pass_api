const express = require('express');
const { uploadPhoto, getPhotoUrl } = require('../utils/uploadPhoto');

const router = express.Router();

// GET PHOTO URL
// This endpoint retrieves the download URL for photos based on category
// Query params: category, userId (uid), relatedEntityId, fileName (optional for categories that support listing)
// 
// Examples:
// - Get specific seatmap image: GET /api/uploadPhoto?category=seatmap_images&userId=uid&relatedEntityId=venueId&fileName=image.jpg
// - List all seatmap images: GET /api/uploadPhoto?category=seatmap_images&userId=uid&relatedEntityId=venueId
// - Get specific venue image: GET /api/uploadPhoto?category=venue_images&userId=uid&relatedEntityId=venueId&fileName=image.jpg
router.get('/', async (req, res) => {
  try {
    const { category, userId, relatedEntityId, fileName } = req.query;
    
    console.log('[GET /api/uploadPhoto] Request params:', {
      category,
      userId,
      relatedEntityId,
      fileName
    });
    
    if (!category || !userId) {
      console.log('[GET /api/uploadPhoto] Missing required parameters');
      return res.status(400).json({ 
        error: 'Missing required parameters',
        message: 'category and userId are required' 
      });
    }

    console.log('[GET /api/uploadPhoto] Calling getPhotoUrl with:', {
      category,
      uid: userId,
      relatedEntityId,
      fileName
    });

    const result = await getPhotoUrl({ 
      category, 
      uid: userId, 
      relatedEntityId, 
      fileName 
    });
    
    console.log('[GET /api/uploadPhoto] Success. Result type:', Array.isArray(result) ? 'array' : 'string', 'Result length/count:', Array.isArray(result) ? result.length : 'N/A');
    console.log('[GET /api/uploadPhoto] Result:', result);
    
    res.json(result);
  } catch (error) {
    console.error('[GET /api/uploadPhoto] Error getting photo URL:', error);
    const statusCode = error.message.includes('required') || error.message.includes('Invalid') ? 400 : 500;
    res.status(statusCode).json({ 
      error: 'Failed to get photo URL.',
      message: error.message 
    });
  }
});

// UPLOAD PHOTO
// This endpoint accepts JSON body with photo data
// Required: fileName, uid, uri
// Optional: category (production_images, venue_images, seatmap_images, settings_images)
// Optional: relatedEntityId (productionId or venueId, required for production_images, venue_images, seatmap_images)
// 
// Examples:
// - Production image: { fileName, uid, uri, category: 'production_images', relatedEntityId: productionId }
// - Venue image: { fileName, uid, uri, category: 'venue_images', relatedEntityId: venueId }
// - Seatmap image: { fileName, uid, uri, category: 'seatmap_images', relatedEntityId: venueId }
// - Settings/Avatar: { fileName, uid, uri, category: 'settings_images' }
router.post('/', async (req, res) => {
  try {
    const downloadURL = await uploadPhoto(req.body);
    console.log('Photo uploaded successfully:', downloadURL);
    res.json(downloadURL);
  } catch (error) {
    console.error('Error uploading photo:', error);
    const statusCode = error.message.includes('required') || error.message.includes('Invalid') ? 400 : 500;
    res.status(statusCode).json({ 
      error: 'Failed to upload photo.',
      message: error.message 
    });
  }
});

module.exports = router;


