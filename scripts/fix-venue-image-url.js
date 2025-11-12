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

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function fixVenueImageUrl() {
  try {
    const venueId = 'mhaaru5tfjnd5yhwvl7';
    
    // Get the venue from Firestore
    const venueDoc = await db.collection('venues').doc(venueId).get();
    
    if (!venueDoc.exists) {
      console.log(`Venue ${venueId} not found in database`);
      return;
    }
    
    const venue = venueDoc.data();
    console.log(`Venue: ${venue.name || 'Unknown'}`);
    console.log(`Current imageURL: ${venue.imageURL || 'None'}\n`);
    
    // Find the actual file in storage
    const userId = 'BN1q8EPHMUVq2RWDhk9xVOFD0Yy1';
    const prefix = `users/${userId}/venue_images/${venueId}/`;
    
    console.log(`Checking files in storage under: ${prefix}`);
    const [files] = await bucket.getFiles({ prefix });
    
    if (files.length === 0) {
      console.log('No files found in storage for this venue');
      return;
    }
    
    // Get the most recent file (or the only file)
    const actualFile = files[0];
    const actualUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURI(actualFile.name)}`;
    
    console.log(`\nFound ${files.length} file(s) in storage:`);
    files.forEach(file => {
      console.log(`  - ${file.name}`);
    });
    
    console.log(`\nCorrect URL should be: ${actualUrl}`);
    
    // Check if the URL in database matches
    if (venue.imageURL === actualUrl) {
      console.log('\n✓ Database URL is already correct!');
    } else {
      console.log('\n⚠ Database URL does not match actual file');
      console.log(`Updating venue imageURL to: ${actualUrl}`);
      
      // Update the venue
      await db.collection('venues').doc(venueId).update({
        imageURL: actualUrl,
        updatedAt: new Date().toISOString()
      });
      
      console.log('✓ Venue updated successfully!');
    }
    
    // Make sure the file is public
    const [metadata] = await actualFile.getMetadata();
    const isPublic = metadata.acl?.some(acl => acl.entity === 'allUsers');
    
    if (!isPublic) {
      console.log('\nMaking file public...');
      await actualFile.makePublic();
      console.log('✓ File is now public!');
    } else {
      console.log('\n✓ File is already public');
    }
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixVenueImageUrl()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

