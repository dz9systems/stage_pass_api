const { auth } = require("../firebase");

async function verifyFirebaseIdToken(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer (.+)$/i);
    if (!match) {
      return res.status(401).json({ error: "Missing Authorization Bearer token" });
    }
    const idToken = match[1];
    const decoded = await auth.verifyIdToken(idToken);
    req.user = { uid: decoded.uid, email: decoded.email || null, decodedToken: decoded };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Optional authentication - sets req.user if token is present, but doesn't fail if missing
async function optionalAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer (.+)$/i);
    if (match) {
      const idToken = match[1];
      try {
        const decoded = await auth.verifyIdToken(idToken);
        req.user = { uid: decoded.uid, id: decoded.uid, email: decoded.email || null, decodedToken: decoded };
      } catch (err) {
        // Token invalid, but continue without authentication
      }
    }
    next();
  } catch (err) {
    // Continue without authentication
    next();
  }
}

module.exports = { verifyFirebaseIdToken, optionalAuth };




