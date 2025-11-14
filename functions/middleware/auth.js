const { auth } = require('../firebase');

async function verifyFirebaseIdToken(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer (.+)$/i);
    if (!match) {
      return res.status(401).json({ error: 'Missing Authorization Bearer token' });
    }
    const idToken = match[1];
    const decoded = await auth.verifyIdToken(idToken);
    req.user = { uid: decoded.uid, email: decoded.email || null, decodedToken: decoded };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { verifyFirebaseIdToken };










