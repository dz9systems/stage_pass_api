const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const { sendGreetingEmail } = require('../services/email');

// Firestore trigger: when a new user document is created, send welcome email
exports.onUserCreatedSendWelcome = onDocumentCreated('users/{uid}', async (event) => {
  try {
    const snap = event.data;
    if (!snap) {
      
      return;
    }

    const user = snap.data();
    const uid = event.params.uid;

    const email = user?.email;
    const displayName = user?.displayName || user?.name || 'there';
    const role = user?.role || 'customer';

    if (!email) {
      
      return;
    }

    

    await sendGreetingEmail({
      to: email,
      name: displayName,
      role,
      subject: 'Welcome to Stage Pass Pro!'
    });

    
  } catch (error) {
    // Log detailed error to functions logs
    
    // Do not throw to avoid retries spamming emails
  }
});


