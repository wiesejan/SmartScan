# SmartScan PWA

A Progressive Web App for document digitization with AI-powered categorization and Dropbox storage.

## Features

- **Camera Capture**: Take photos of documents directly in the app
- **AI Analysis**: Automatic document categorization using Claude AI
- **PDF Conversion**: Convert captured images to PDF format
- **Dropbox Storage**: Automatically organize and upload to Dropbox
- **Offline Support**: Works offline as a PWA
- **Mobile-First**: Optimized for mobile devices with responsive design

## Quick Start

### 1. Generate Icons

Open `icons/generate-icons.html` in a browser and download the generated icons:
- `icon-192.png`
- `icon-512.png`
- `favicon.png` (rename to `favicon.ico` or convert)

### 2. Serve the App

For local development, serve the files with any static server:

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js
npx serve

# Using PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

### 3. Configure APIs

1. Open the app and click the settings icon (gear)
2. Enter your **Dropbox Client ID** (see below)
3. Enter your **Claude API Key** (see below)
4. Click "Connect to Dropbox" and authorize

## API Setup

### Dropbox App

1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Click "Create app"
3. Choose "Scoped access"
4. Choose "Full Dropbox" or "App folder"
5. Name your app (e.g., "SmartScan")
6. In the app settings:
   - Add your redirect URI (e.g., `http://localhost:8000` for development)
   - Copy the "App key" (this is your Client ID)
7. Under Permissions, enable:
   - `files.content.write`
   - `files.content.read`

### Claude API

1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Create an account or sign in
3. Go to API Keys
4. Create a new API key
5. Copy the key (starts with `sk-ant-`)

**Note**: The Claude API requires the `anthropic-dangerous-direct-browser-access` header for browser usage. This is enabled in the app.

## Project Structure

```
SmartScan/
├── index.html              # Main HTML with all screens
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker
├── src/
│   ├── app.js              # Main application logic
│   ├── config.js           # Configuration
│   ├── camera.js           # Camera access and capture
│   ├── claude-api.js       # Claude API integration
│   ├── dropbox-api.js      # Dropbox OAuth + upload
│   ├── pdf-converter.js    # Image to PDF conversion
│   ├── ui.js               # UI state management
│   └── utils.js            # Helper functions
├── styles/
│   └── main.css            # All styles
├── icons/
│   ├── icon.svg            # Source SVG icon
│   ├── icon-192.png        # PWA icon (generate)
│   ├── icon-512.png        # PWA icon large (generate)
│   └── generate-icons.html # Icon generator
└── README.md
```

## Document Categories

SmartScan automatically categorizes documents into:

| Category | German Label | Dropbox Folder |
|----------|--------------|----------------|
| invoice | Rechnung | Rechnungen |
| receipt | Beleg | Belege |
| contract | Vertrag | Verträge |
| letter | Brief | Briefe |
| tax | Steuer | Steuer |
| insurance | Versicherung | Versicherungen |
| medical | Medizinisch | Medizin |
| bank | Bank | Bank |
| warranty | Garantie | Garantien |
| other | Sonstiges | Sonstiges |

## Workflow

1. **Home Screen**: Tap "Dokument scannen" to start
2. **Camera Screen**: Capture document or upload from gallery
3. **Processing Screen**: AI analyzes the document
4. **Edit Screen**: Review and edit detected metadata
5. **Success Screen**: Document saved to Dropbox

## File Naming

Documents are saved with the format:
```
/SmartScan/{Category}/{YYYY-MM-DD}_{document_name}.pdf
```

Example: `/SmartScan/Rechnungen/2024-01-15_stromrechnung_januar.pdf`

## Deployment

### GitHub Pages

1. Push to GitHub repository
2. Go to Settings > Pages
3. Select "Deploy from a branch"
4. Choose `main` branch and `/ (root)`
5. Update Dropbox redirect URI to your GitHub Pages URL

### Custom Domain

1. Add a `CNAME` file with your domain
2. Configure DNS to point to GitHub Pages
3. Update Dropbox redirect URI

## Browser Support

- Chrome/Edge 80+
- Safari 14+
- Firefox 75+
- Samsung Internet 12+

Camera access requires HTTPS (except localhost).

## Troubleshooting

### Camera not working
- Ensure HTTPS or localhost
- Check browser permissions
- Try switching cameras

### Dropbox connection fails
- Verify Client ID is correct
- Check redirect URI matches exactly
- Clear browser data and retry

### Claude API errors
- Verify API key is valid
- Check API key has sufficient credits
- Rate limiting: wait and retry

## Security Notes

- API keys are stored in browser localStorage
- Dropbox tokens are stored in sessionStorage
- No data is sent to third parties except Dropbox and Anthropic
- All processing happens client-side

## License

MIT License

## Credits

- Built with [jsPDF](https://github.com/parallax/jsPDF)
- AI powered by [Claude](https://www.anthropic.com/claude)
- Storage by [Dropbox](https://www.dropbox.com/)
