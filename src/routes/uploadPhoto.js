const express = require('express');
const { uploadPhoto } = require('../utils/uploadPhoto');

const router = express.Router();

// UPLOAD PHOTO
// This endpoint accepts JSON body with photo data (uri)
router.post('/', async (req, res) => {
  try {
    const downloadURL = await uploadPhoto(req.body);
    console.log('Photo uploaded successfully:', downloadURL);
    res.json(downloadURL);
  } catch (error) {
    console.error('Error uploading photo:', error);
    res.status(500).json({ error: 'Failed to upload photo.' });
  }
});

module.exports = router;

