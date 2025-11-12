#!/usr/bin/env node

const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    : null;

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "stage-pass-b1d9b.firebasestorage.app"
    });
  } else {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || "stage-pass-b1d9b",
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "stage-pass-b1d9b.firebasestorage.app"
    });
  }
}

const bucket = admin.storage().bucket();

async function checkVenueFiles() {
  try {
    const userId = 'BN1q8EPHMUVq2RWDhk9xVOFD0Yy1';
    const venueId = 'mhaaru5tfjnd5yhwvl7';
    const prefix = `users/${userId}/venue_images/${venueId}/`;
    
    console.log(`Checking files under: ${prefix}\n`);
    
    const [files] = await bucket.getFiles({ prefix });
    
    console.log(`Found ${files.length} files:\n`);
    
    for (const file of files) {
      try {
        const [metadata] = await file.getMetadata();
        const isPublic = metadata.acl?.some(acl => acl.entity === 'allUsers');
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURI(file.name)}`;
        
        console.log(`File: ${file.name}`);
        console.log(`  Public: ${isPublic ? 'YES' : 'NO'}`);
        console.log(`  URL: ${publicUrl}`);
        console.log(`  Size: ${metadata.size} bytes`);
        console.log(`  Content Type: ${metadata.contentType}`);
        console.log('');
        
        // Make it public if it's not
        if (!isPublic) {
          console.log(`  Making public...`);
          await file.makePublic();
          console.log(`  ✓ Now public!\n`);
        }
      } catch (error) {
        console.error(`  ✗ Error: ${error.message}\n`);
      }
    }
    
    // Also check for the specific file
    const specificFile = bucket.file(`users/${userId}/venue_images/${venueId}/1762322653091_woodminster.png`);
    const [exists] = await specificFile.exists();
    
    if (exists) {
      console.log(`\nSpecific file exists: 1762322653091_woodminster.png`);
      const [metadata] = await specificFile.getMetadata();
      const isPublic = metadata.acl?.some(acl => acl.entity === 'allUsers');
      console.log(`  Public: ${isPublic ? 'YES' : 'NO'}`);
      
      if (!isPublic) {
        await specificFile.makePublic();
        console.log(`  ✓ Made public!`);
      }
    } else {
      console.log(`\n⚠ Specific file NOT FOUND: 1762322653091_woodminster.png`);
      console.log(`  This file does not exist in storage.`);
    }
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkVenueFiles()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

