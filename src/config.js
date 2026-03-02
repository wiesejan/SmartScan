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
    // Finanzen
    { id: 'payslip',          label: 'Gehaltsabrechnung',       folder: 'Finanzen/Gehaltsabrechnung' },
    { id: 'bank',             label: 'Bankdokument',            folder: 'Finanzen/Bank' },
    { id: 'investment',       label: 'Depot / Wertpapiere',     folder: 'Finanzen/Investment' },
    { id: 'tax',              label: 'Steuerdokument',          folder: 'Finanzen/Steuer' },
    { id: 'savings',          label: 'Spar- & Bausparvertrag',  folder: 'Finanzen/Sparvertraege' },
    // Rechnungen & Belege
    { id: 'invoice',          label: 'Rechnung',                folder: 'Rechnungen' },
    { id: 'receipt',          label: 'Kassenbeleg / Quittung',  folder: 'Belege' },
    // Verträge
    { id: 'contract-utility', label: 'Strom / Gas / Wasser',   folder: 'Vertraege/Versorgung' },
    { id: 'contract-telecom', label: 'Mobilfunk / Internet',    folder: 'Vertraege/Telekommunikation' },
    { id: 'contract-general', label: 'Sonstiger Vertrag',       folder: 'Vertraege/Sonstige' },
    // Versicherungen
    { id: 'insurance-health',    label: 'Krankenversicherung',  folder: 'Versicherungen/Kranken' },
    { id: 'insurance-vehicle',   label: 'KFZ-Versicherung',     folder: 'Versicherungen/KFZ' },
    { id: 'insurance-liability', label: 'Haftpflicht',          folder: 'Versicherungen/Haftpflicht' },
    { id: 'insurance-other',     label: 'Sonstige Versicherung',folder: 'Versicherungen/Sonstige' },
    // Weitere
    { id: 'medical',  label: 'Medizinisches Dokument', folder: 'Medizin' },
    { id: 'official', label: 'Behördendokument',        folder: 'Behoerden' },
    // Sonstiges
    { id: 'other', label: 'Sonstiges', folder: 'Sonstiges' }
  ],

  // Dropbox OAuth configuration
  // App owner setup: create one app at https://www.dropbox.com/developers/apps
  // Choose "Scoped access" → "Full Dropbox", copy the App key below.
  // End users only need to click "Mit Dropbox verbinden" — no developer setup required.
  dropbox: {
    clientId: 'YOUR_DROPBOX_APP_KEY', // Set once by the app owner (or via Settings UI)
    redirectUri: '', // Auto-detected from current URL
    authEndpoint: 'https://www.dropbox.com/oauth2/authorize',
    tokenEndpoint: 'https://api.dropboxapi.com/oauth2/token',
    apiEndpoint: 'https://api.dropboxapi.com/2',
    contentEndpoint: 'https://content.dropboxapi.com/2',
    baseFolder: '/SmartScan' // Root folder for all uploads
  },

  // Nextcloud WebDAV configuration
  // Users enter their own server URL, username, and an app password
  // (generate app passwords in Nextcloud: Settings → Security → App passwords)
  nextcloud: {
    baseFolder: '/SmartScan' // Root folder inside the user's Nextcloud
  },

  // Storage target: 'dropbox' | 'nextcloud' | 'both'
  // Can be overridden per-user via localStorage key 'smartscan_storage_target'
  storageTarget: 'dropbox',

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
    margin: 5 // mm (0.5cm) - minimal margin, top-aligned when aspect differs
  },

  // Storage keys for sessionStorage/localStorage
  storage: {
    dropboxToken: 'smartscan_dropbox_token',
    dropboxRefreshToken: 'smartscan_dropbox_refresh',
    dropboxClientId: 'smartscan_dropbox_client_id', // Optional override of config clientId
    codeVerifier: 'smartscan_code_verifier',
    nextcloudUrl: 'smartscan_nextcloud_url',
    nextcloudUsername: 'smartscan_nextcloud_username',
    nextcloudPassword: 'smartscan_nextcloud_password',
    storageTarget: 'smartscan_storage_target',
    settings: 'smartscan_settings'
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
