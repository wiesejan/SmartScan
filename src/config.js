/**
 * SmartScan Configuration
 * Contains all configurable settings for the application
 */

export const CONFIG = {
  // App metadata
  app: {
    name: 'SmartScan',
    version: '2.0.0',
    description: 'Document digitization with local AI - 100% offline capable'
  },

  // Document categories for classification
  categories: [
    { id: 'invoice', label: 'Rechnung', folder: 'Rechnungen' },
    { id: 'receipt', label: 'Beleg', folder: 'Belege' },
    { id: 'contract', label: 'Vertrag', folder: 'Verträge' },
    { id: 'letter', label: 'Brief', folder: 'Briefe' },
    { id: 'tax', label: 'Steuer', folder: 'Steuer' },
    { id: 'insurance', label: 'Versicherung', folder: 'Versicherungen' },
    { id: 'medical', label: 'Medizinisch', folder: 'Medizin' },
    { id: 'bank', label: 'Bank', folder: 'Bank' },
    { id: 'warranty', label: 'Garantie', folder: 'Garantien' },
    { id: 'other', label: 'Sonstiges', folder: 'Sonstiges' }
  ],

  // Dropbox OAuth configuration
  dropbox: {
    clientId: '', // Set via UI or environment
    redirectUri: '', // Auto-detected from current URL
    authEndpoint: 'https://www.dropbox.com/oauth2/authorize',
    tokenEndpoint: 'https://api.dropboxapi.com/oauth2/token',
    apiEndpoint: 'https://api.dropboxapi.com/2',
    contentEndpoint: 'https://content.dropboxapi.com/2',
    baseFolder: '/SmartScan' // Root folder for all uploads
  },

  // OCR configuration (Tesseract.js)
  ocr: {
    language: 'deu', // German
    cacheMethod: 'indexedDB'
  },

  // Classifier configuration
  classifier: {
    useML: false, // Set to true for ML-enhanced classification (larger download)
    minConfidence: 0.3, // Minimum confidence for auto-classification
    showReviewIfBelow: 0.6 // Show review UI if confidence below this
  },

  // Image processing settings
  image: {
    maxWidth: 2048,
    maxHeight: 2048,
    quality: 0.85,
    maxSizeBytes: 2 * 1024 * 1024, // 2MB
    outputFormat: 'image/jpeg'
  },

  // PDF settings
  pdf: {
    pageFormat: 'a4',
    orientation: 'portrait',
    margin: 10 // mm
  },

  // Storage keys for sessionStorage/localStorage
  storage: {
    dropboxToken: 'smartscan_dropbox_token',
    dropboxRefreshToken: 'smartscan_dropbox_refresh',
    codeVerifier: 'smartscan_code_verifier',
    dropboxClientId: 'smartscan_dropbox_client_id',
    settings: 'smartscan_settings',
    modelsLoaded: 'smartscan_models_loaded'
  }
};

/**
 * Get category by ID
 * @param {string} id - Category ID
 * @returns {Object|undefined} Category object
 */
export function getCategoryById(id) {
  return CONFIG.categories.find(cat => cat.id === id);
}

/**
 * Get category by label (case-insensitive)
 * @param {string} label - Category label
 * @returns {Object|undefined} Category object
 */
export function getCategoryByLabel(label) {
  const lowerLabel = label.toLowerCase();
  return CONFIG.categories.find(cat => cat.label.toLowerCase() === lowerLabel);
}

/**
 * Get Dropbox redirect URI based on current location
 * @returns {string} Redirect URI
 */
export function getRedirectUri() {
  if (CONFIG.dropbox.redirectUri) {
    return CONFIG.dropbox.redirectUri;
  }
  // Auto-detect from current URL
  const { protocol, host, pathname } = window.location;
  // For GitHub Pages, include the repo name in path
  // e.g., https://user.github.io/SmartScan/
  const basePath = pathname.endsWith('/') ? pathname : pathname + '/';
  return `${protocol}//${host}${basePath}`;
}
