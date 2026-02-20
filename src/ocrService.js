/**
 * SmartScan OCR Service
 * Text extraction using PaddleOCR (client-side-ocr)
 * High accuracy, 100+ languages, fully local processing
 */

import { CONFIG } from './config.js';

/**
 * OCR Service class for document text extraction
 * Uses PaddleOCR via client-side-ocr library
 */
class OCRService {
  constructor() {
    this.engine = null;
    this.isReady = false;
    this.loadProgress = 0;
    this.onProgress = null;
    this.createEngine = null; // Will be loaded dynamically
  }

  /**
   * Initialize PaddleOCR engine
   * @param {Function} onProgress - Progress callback (percent, status)
   * @returns {Promise<void>}
   */
  async init(onProgress = null) {
    if (this.isReady && this.engine) return;

    this.onProgress = onProgress;

    try {
      // Step 1: Load the client-side-ocr library
      this.updateProgress(5, 'OCR-Bibliothek wird geladen...');

      if (!this.createEngine) {
        await this.loadOCRLibrary();
      }

      this.updateProgress(15, 'OCR-Engine wird erstellt...');

      // Step 2: Create the OCR engine with German language
      this.engine = this.createEngine({
        language: CONFIG.ocr.language || 'de',
        modelVersion: CONFIG.ocr.modelVersion || 'PP-OCRv4',
        modelType: CONFIG.ocr.modelType || 'mobile'
      });

      this.updateProgress(25, 'Modelle werden geladen...');

      // Step 3: Initialize the engine (downloads models if needed)
      // Wrap in a promise to track progress
      const initPromise = this.engine.initialize();

      // Simulate progress while models load (actual progress not exposed by library)
      const progressInterval = setInterval(() => {
        if (this.loadProgress < 90) {
          this.updateProgress(
            this.loadProgress + 5,
            'Sprachmodell wird geladen...'
          );
        }
      }, 500);

      await initPromise;

      clearInterval(progressInterval);
      this.updateProgress(100, 'OCR bereit');

      this.isReady = true;
      console.log('[OCR] PaddleOCR engine initialized successfully');

    } catch (error) {
      console.error('[OCR] Initialization failed:', error);
      this.updateProgress(0, 'Fehler beim Laden');
      throw new Error(`OCR-Initialisierung fehlgeschlagen: ${error.message}`);
    }
  }

  /**
   * Dynamically load the client-side-ocr library from CDN
   */
  async loadOCRLibrary() {
    try {
      const cdnUrl = CONFIG.ocr.cdnUrl || 'https://unpkg.com/client-side-ocr@latest/dist/index.mjs';

      // Dynamic import from CDN
      const module = await import(/* webpackIgnore: true */ cdnUrl);

      // Use RapidOCR engine for German language support
      if (module.createRapidOCREngine) {
        this.createEngine = module.createRapidOCREngine;
        console.log('[OCR] Using RapidOCR engine');
      } else if (module.createOCREngine) {
        this.createEngine = module.createOCREngine;
        console.log('[OCR] Using standard OCR engine');
      } else {
        throw new Error('No OCR engine found in module');
      }

    } catch (error) {
      console.error('[OCR] Failed to load library:', error);
      throw new Error(`OCR-Bibliothek konnte nicht geladen werden: ${error.message}`);
    }
  }

  /**
   * Update progress callback
   * @param {number} percent - Progress percentage (0-100)
   * @param {string} status - Status message
   */
  updateProgress(percent, status) {
    this.loadProgress = percent;
    if (this.onProgress) {
      this.onProgress(percent, status);
    }
  }

  /**
   * Convert image element or canvas to File object for PaddleOCR
   * @param {HTMLImageElement|HTMLCanvasElement|string} image - Image source
   * @returns {Promise<File>} Image as File object
   */
  async imageToFile(image) {
    let canvas;

    if (image instanceof HTMLCanvasElement) {
      canvas = image;
    } else if (image instanceof HTMLImageElement) {
      canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
    } else if (typeof image === 'string' && image.startsWith('data:')) {
      // Data URL
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = image;
      });
      canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
    } else {
      throw new Error('Unsupported image format');
    }

    // Convert canvas to blob, then to File
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], 'document.jpg', { type: 'image/jpeg' });
          resolve(file);
        } else {
          reject(new Error('Failed to convert image to blob'));
        }
      }, 'image/jpeg', 0.95);
    });
  }

  /**
   * Extract text from an image
   * @param {HTMLImageElement|HTMLCanvasElement|string} image - Image source
   * @returns {Promise<Object>} OCR result with text and confidence
   */
  async recognize(image) {
    if (!this.isReady || !this.engine) {
      await this.init();
    }

    try {
      // Convert image to File format required by client-side-ocr
      const imageFile = await this.imageToFile(image);

      // Process image with PaddleOCR
      const result = await this.engine.processImage(imageFile, {
        enableWordSegmentation: true,
        enableTextClassification: true
      });

      // Map result to our expected format (compatible with Tesseract format)
      return this.mapResult(result);

    } catch (error) {
      console.error('[OCR] Recognition failed:', error);
      throw new Error(`Texterkennung fehlgeschlagen: ${error.message}`);
    }
  }

  /**
   * Map PaddleOCR result to our standard format
   * @param {Object} result - Raw PaddleOCR result
   * @returns {Object} Standardized result
   */
  mapResult(result) {
    // Handle different result formats from client-side-ocr
    const text = result.text || '';
    const confidence = result.confidence || 0;

    // Extract lines from result
    const lines = (result.lines || []).map(line => ({
      text: line.text || line,
      confidence: line.confidence || confidence,
      bbox: line.bbox || line.box || null
    }));

    // Extract words if available
    const words = [];
    if (result.wordBoxes) {
      for (const wordBox of result.wordBoxes) {
        words.push({
          text: wordBox.text || wordBox.word || '',
          confidence: wordBox.confidence || confidence
        });
      }
    } else if (lines.length > 0) {
      // Fallback: split lines into words
      for (const line of lines) {
        const lineWords = (line.text || '').split(/\s+/).filter(w => w.length > 0);
        for (const word of lineWords) {
          words.push({
            text: word,
            confidence: line.confidence || confidence
          });
        }
      }
    }

    return {
      text,
      confidence: confidence / 100, // Normalize to 0-1 range if needed
      lines,
      words
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
   * Terminate the OCR engine and free resources
   */
  async terminate() {
    if (this.engine) {
      // client-side-ocr doesn't have explicit terminate, but we clean up
      this.engine = null;
      this.isReady = false;
      this.createEngine = null;
      console.log('[OCR] Engine terminated');
    }
  }
}

// Export singleton instance
export const ocrService = new OCRService();
