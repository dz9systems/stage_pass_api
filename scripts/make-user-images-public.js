#!/usr/bin/env node

/**
 * Script to make all existing user images public in Firebase Storage
 * This ensures files are accessible via direct HTTP URLs even though
 * storage rules allow public read (rules only work for Firebase SDK access)
 */

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

async function makeUserImagesPublic() {
  try {
    console.log('Fetching all files under users/...');
    
    // Get all files under users/ prefix
    const [files] = await bucket.getFiles({ prefix: 'users/' });
    
    console.log(`Found ${files.length} files to process`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const file of files) {
      try {
        // Check if file is already public
        const [metadata] = await file.getMetadata();
        const isPublic = metadata.acl?.some(acl => acl.entity === 'allUsers');
        
        if (!isPublic) {
          await file.makePublic();
          console.log(`✓ Made public: ${file.name}`);
          successCount++;
        } else {
          console.log(`- Already public: ${file.name}`);
        }
      } catch (error) {
        console.error(`✗ Error processing ${file.name}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n=== Summary ===');
    console.log(`Total files: ${files.length}`);
    console.log(`Made public: ${successCount}`);
    console.log(`Already public: ${files.length - successCount - errorCount}`);
    console.log(`Errors: ${errorCount}`);
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

makeUserImagesPublic()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

