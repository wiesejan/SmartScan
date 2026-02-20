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
    { id: 'fin-gehalt', label: 'Gehaltsabrechnung', folder: 'Finanzen/Gehaltsabrechnung' },
    { id: 'fin-steuer', label: 'Steuerdokumente', folder: 'Finanzen/Steuerdokumente' },
    { id: 'fin-bauspar', label: 'Bausparvertrag', folder: 'Finanzen/Bausparvertraege' },
    { id: 'fin-dkb', label: 'DKB', folder: 'Finanzen/DKB' },
    { id: 'fin-haspa', label: 'Haspa', folder: 'Finanzen/Haspa' },
    { id: 'fin-depot', label: 'Wertpapierdepot', folder: 'Finanzen/Wertpapierdepots' },
    { id: 'fin-bav', label: 'Betriebliche Altersvorsorge', folder: 'Finanzen/Betriebliche-Altersvorsorge' },
    { id: 'fin-kreditkarte', label: 'Kreditkartenabrechnung', folder: 'Finanzen/Kreditkartenabrechnungen' },
    // Rechnungen
    { id: 'rechnung', label: 'Rechnung', folder: 'Rechnungen' },
    // Verträge
    { id: 'vertrag-erdgas', label: 'Erdgas', folder: 'Vertraege/Erdgas' },
    { id: 'vertrag-mobilfunk', label: 'Mobilfunkvertrag', folder: 'Vertraege/Mobilfunk' },
    { id: 'vertrag-internet', label: 'Internet + Telefon', folder: 'Vertraege/Internet-Telefon' },
    { id: 'vertrag-strom', label: 'Strom', folder: 'Vertraege/Strom' },
    // Versicherungen
    { id: 'vers-auto', label: 'Auto + E-Scooter', folder: 'Versicherungen/Auto-E-Scooter' },
    { id: 'vers-bu', label: 'Berufsunfähigkeit', folder: 'Versicherungen/Berufsunfaehigkeit' },
    { id: 'vers-rente', label: 'Deutsche Rentenversicherung', folder: 'Versicherungen/Deutsche-Rentenversicherung' },
    { id: 'vers-haftpflicht', label: 'Haftpflicht', folder: 'Versicherungen/Haftpflicht' },
    { id: 'vers-hausrat', label: 'Hausrat', folder: 'Versicherungen/Hausrat' },
    { id: 'vers-kranken', label: 'Krankenversicherung', folder: 'Versicherungen/Krankenversicherung' },
    { id: 'vers-kuendigung', label: 'Kündigung Versicherung', folder: 'Versicherungen/Kuendigungen' },
    { id: 'vers-rechtsschutz', label: 'Rechtsschutz', folder: 'Versicherungen/Rechtsschutz' },
    { id: 'vers-reise', label: 'Reiseversicherung', folder: 'Versicherungen/Reiseversicherung' },
    { id: 'vers-risiko-jan', label: 'Risiko-Leben Jan', folder: 'Versicherungen/Risiko-Leben-Jan' },
    { id: 'vers-wohngebaeude', label: 'Wohngebäude', folder: 'Versicherungen/Wohngebaeude' },
    { id: 'vers-zahn', label: 'Zahnzusatz', folder: 'Versicherungen/Zahnzusatz' },
    // Medizin
    { id: 'medizin', label: 'Medizinisches Dokument', folder: 'Medizin' },
    // Ehe
    { id: 'ehe', label: 'Ehedokument', folder: 'Ehedokumente' },
    // Kinder
    { id: 'kind-salome', label: 'Salomé', folder: 'Kinder/Salome' },
    { id: 'kind-david', label: 'David', folder: 'Kinder/David' },
    // Sonstiges
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

  // OCR configuration (PaddleOCR via client-side-ocr)
  ocr: {
    language: 'de', // German (PaddleOCR language code)
    modelVersion: 'PP-OCRv4', // PP-OCRv4 or PP-OCRv5
    modelType: 'mobile', // 'mobile' (faster) or 'server' (more accurate)
    cdnUrl: 'https://unpkg.com/client-side-ocr@latest/dist/index.mjs'
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
    codeVerifier: 'smartscan_code_verifier',
    dropboxClientId: 'smartscan_dropbox_client_id',
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
