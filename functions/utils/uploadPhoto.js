const { admin } = require('../firebase');

// UPLOAD PHOTO TO FIREBASE STORAGE
const uploadPhoto = async ({ fileName, uid, uri }) => {
  try {
    // GET THE STORAGE BUCKET
    const bucket = admin.storage().bucket();

    // GENERATE A REFERENCE TO A LOCATION ASSOCIATED WITH THE USER
    const filePath = `users/${uid}/${fileName}`;
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

module.exports = { uploadPhoto };

