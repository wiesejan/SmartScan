/**
 * SmartScan OCR Service
 * Text extraction using Tesseract.js (fully local, no server required)
 */

/**
 * OCR Service class for document text extraction
 */
class OCRService {
  constructor() {
    this.worker = null;
    this.isReady = false;
    this.loadProgress = 0;
    this.onProgress = null;
  }

  /**
   * Initialize Tesseract worker
   * @param {Function} onProgress - Progress callback (0-100)
   * @returns {Promise<void>}
   */
  async init(onProgress = null) {
    if (this.isReady) return;

    this.onProgress = onProgress;

    // Dynamically import Tesseract.js from CDN
    if (typeof Tesseract === 'undefined') {
      await this.loadTesseractScript();
    }

    this.updateProgress(5, 'OCR-Engine wird geladen...');

    // Create worker with German language
    this.worker = await Tesseract.createWorker('deu', 1, {
      logger: (m) => {
        if (m.status === 'loading tesseract core') {
          this.updateProgress(10 + m.progress * 30, 'Tesseract Core wird geladen...');
        } else if (m.status === 'initializing tesseract') {
          this.updateProgress(40 + m.progress * 10, 'Tesseract wird initialisiert...');
        } else if (m.status === 'loading language traineddata') {
          this.updateProgress(50 + m.progress * 40, 'Deutsches Sprachmodell wird geladen...');
        } else if (m.status === 'initializing api') {
          this.updateProgress(90 + m.progress * 10, 'OCR wird vorbereitet...');
        }
      },
      cacheMethod: 'indexedDB' // Use IndexedDB for offline caching
    });

    this.isReady = true;
    this.updateProgress(100, 'OCR bereit');
  }

  /**
   * Load Tesseract.js script from CDN
   */
  async loadTesseractScript() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load Tesseract.js'));
      document.head.appendChild(script);
    });
  }

  /**
   * Update progress
   */
  updateProgress(percent, status) {
    this.loadProgress = percent;
    if (this.onProgress) {
      this.onProgress(percent, status);
    }
  }

  /**
   * Extract text from an image
   * @param {HTMLImageElement|HTMLCanvasElement|string} image - Image source
   * @returns {Promise<Object>} OCR result with text and confidence
   */
  async recognize(image) {
    if (!this.isReady) {
      await this.init();
    }

    const result = await this.worker.recognize(image);

    return {
      text: result.data.text,
      confidence: result.data.confidence / 100,
      lines: result.data.lines.map(line => ({
        text: line.text,
        confidence: line.confidence / 100,
        bbox: line.bbox
      })),
      words: result.data.words.map(word => ({
        text: word.text,
        confidence: word.confidence / 100
      }))
    };
  }

  /**
   * Extract structured data from OCR text
   * @param {string} text - Raw OCR text
   * @returns {Object} Extracted data (dates, amounts, keywords)
   */
  extractStructuredData(text) {
    const data = {
      dates: [],
      amounts: [],
      keywords: [],
      sender: null
    };

    // Extract dates (various German formats)
    const datePatterns = [
      /(\d{1,2})\.(\d{1,2})\.(\d{4})/g,  // DD.MM.YYYY
      /(\d{1,2})\.(\d{1,2})\.(\d{2})/g,   // DD.MM.YY
      /(\d{4})-(\d{2})-(\d{2})/g,         // YYYY-MM-DD
      /(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s*(\d{4})/gi
    ];

    for (const pattern of datePatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        data.dates.push(match[0]);
      }
    }

    // Extract amounts (German format)
    const amountPattern = /(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*(?:€|EUR|Euro)/gi;
    const amountMatches = text.matchAll(amountPattern);
    for (const match of amountMatches) {
      data.amounts.push(match[0]);
    }

    // Extract keywords for classification
    const keywordPatterns = {
      invoice: /rechnung|invoice|faktura|rechnungsnummer|ust-id|mwst/gi,
      receipt: /quittung|kassenbon|beleg|kassier|bar\s*gezahlt/gi,
      contract: /vertrag|vereinbarung|unterschrift|laufzeit|kündigung/gi,
      letter: /sehr\s*geehrte|mit\s*freundlichen\s*grüßen|betreff:/gi,
      tax: /steuer|finanzamt|steuernummer|einkommensteuer|lohnsteuer/gi,
      insurance: /versicherung|police|schadensmeldung|deckung|prämie/gi,
      medical: /arzt|praxis|diagnose|rezept|krankenkasse|patient/gi,
      bank: /kontoauszug|überweisung|iban|bic|guthaben|saldo/gi,
      warranty: /garantie|gewährleistung|kaufbeleg|seriennummer/gi
    };

    for (const [category, pattern] of Object.entries(keywordPatterns)) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        data.keywords.push({
          category,
          count: matches.length,
          matches: [...new Set(matches.map(m => m.toLowerCase()))]
        });
      }
    }

    // Sort keywords by frequency
    data.keywords.sort((a, b) => b.count - a.count);

    // Try to extract sender (first line often contains sender info)
    const lines = text.split('\n').filter(l => l.trim().length > 3);
    if (lines.length > 0) {
      // Look for company names (often in uppercase or with common suffixes)
      const senderPatterns = [
        /^([A-ZÄÖÜ][A-Za-zäöüßÄÖÜ\s&.-]+(?:GmbH|AG|e\.V\.|KG|OHG|mbH))/m,
        /^([A-ZÄÖÜ]{2,}[A-Za-zäöüßÄÖÜ\s&.-]*)/m
      ];

      for (const pattern of senderPatterns) {
        const match = text.match(pattern);
        if (match && match[1].length > 3 && match[1].length < 100) {
          data.sender = match[1].trim();
          break;
        }
      }
    }

    return data;
  }

  /**
   * Terminate the worker
   */
  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isReady = false;
    }
  }
}

// Export singleton instance
export const ocrService = new OCRService();
