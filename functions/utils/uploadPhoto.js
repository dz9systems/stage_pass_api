const { initializeApp } = require('firebase/app');
const { getStorage, ref, uploadBytesResumable, getDownloadURL } = require('firebase/storage');

// Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyAlEj1egHnEn_Kr15Vi3OTwefghhPod3jU',
  authDomain: 'stage-pass-b1d9b.firebaseapp.com',
  projectId: 'stage-pass-b1d9b',
  storageBucket: 'stage-pass-b1d9b.firebasestorage.app',
  messagingSenderId: '55719597935',
  appId: '1:55719597935:web:acb9ad699bb5ad2547ba9a',
  measurementId: 'G-M2BLZYWPJE'
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

/**
 * Upload photo to Firebase Storage
 * @param {Object} params - Upload parameters
 * @param {string} params.fileName - Name of the file to save
 * @param {string} params.uid - User ID for organizing files
 * @param {string} [params.uri] - URI of the image to upload (can be URL, data URI, or file path)
 * @param {Buffer|Blob} [params.buffer] - Buffer or Blob of the file to upload (alternative to uri)
 * @param {string} [params.mimeType] - MIME type of the file (required if using buffer)
 * @returns {Promise<string>} Download URL of the uploaded file
 */
const uploadPhoto = async ({ fileName, uid, uri, buffer, mimeType }) => {
  try {
    // GET THE STORAGE REFERENCE
    const storage = getStorage();

    // GENERATE A REFERENCE TO A LOCATION ASSOCIATED WITH THE USER
    const storageRef = ref(storage, `users/${uid}/${fileName}`);

    let blob;

    // HANDLE BUFFER/BLOB DIRECTLY OR FETCH FROM URI
    if (buffer) {
      // If buffer is provided, convert to Blob
      if (Buffer.isBuffer(buffer)) {
        blob = new Blob([buffer], { type: mimeType || 'image/jpeg' });
      } else {
        blob = buffer; // Already a Blob
      }
    } else if (uri) {
      // FETCH THE PHOTO DATA FROM THE PROVIDED URI
      const response = await fetch(uri);
      blob = await response.blob();
    } else {
      throw new Error('Either uri or buffer must be provided');
    }

    // UPLOAD THE FILE TO THE STORAGE BUCKET
    const uploadTask = await uploadBytesResumable(storageRef, blob);

    // GET DOWNLOAD URL
    const downloadURL = await getDownloadURL(uploadTask.ref);

    // RETURN THE DOWNLOAD URL
    return downloadURL;
  } catch (error) {
    console.error('Error uploading photo:', error);
    throw error; // Re-throw so callers can handle it
  }
};

module.exports = { uploadPhoto };

