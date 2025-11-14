# Assets Folder

This folder contains static assets for the Stage Pass API, such as logos and images used in email templates.

## Logo File

Place your Stage Pass logo here with the filename `logo.png` (or `logo.jpg`, `logo.svg`).

### Recommended Logo Specifications:
- **Format**: PNG with transparent background (or white logo on transparent)
- **Size**: 200-400px wide (will be scaled down in emails)
- **Filename**: `logo.png`, `logo.jpg`, or `logo.svg`

### Accessing the Logo

Once placed here, the logo will be accessible at:
- **Local**: `http://localhost:4242/assets/logo.png`
- **Production**: `https://your-domain.com/assets/logo.png`

### Setting the Logo URL in Environment Variables

Add to your `.env` file:
```
STAGE_PASS_LOGO_URL=http://localhost:4242/assets/logo.png
```

For production, use your production domain:
```
STAGE_PASS_LOGO_URL=https://www.stagepasspro.com/assets/logo.png
```

### Alternative: Firebase Storage

If you prefer to host the logo in Firebase Storage:
1. Upload the logo to Firebase Storage in the `public/` folder
2. Make it publicly accessible
3. Use the Firebase Storage URL in your `.env` file







