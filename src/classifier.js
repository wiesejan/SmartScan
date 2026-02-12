/**
 * SmartScan Document Classifier
 * Hybrid classification using keyword matching and optional ML model
 */

import { CONFIG } from './config.js';

/**
 * Document Classifier class
 * Uses keyword-based classification with ML fallback for ambiguous cases
 */
class DocumentClassifier {
  constructor() {
    this.isReady = false;
    this.useMLModel = false;
    this.pipeline = null;
    this.loadProgress = 0;
    this.onProgress = null;
  }

  /**
   * Initialize classifier
   * @param {Object} options - Configuration options
   * @param {boolean} options.useML - Whether to use ML model (slower, more accurate)
   * @param {Function} options.onProgress - Progress callback
   * @returns {Promise<void>}
   */
  async init(options = {}) {
    if (this.isReady) return;

    const { useML = false, onProgress = null } = options;
    this.useMLModel = useML;
    this.onProgress = onProgress;

    this.updateProgress(50, 'Klassifizierer wird initialisiert...');

    if (useML) {
      await this.initMLModel();
    }

    this.isReady = true;
    this.updateProgress(100, 'Klassifizierer bereit');
  }

  /**
   * Initialize ML model (optional, for improved accuracy)
   */
  async initMLModel() {
    try {
      this.updateProgress(60, 'ML-Modell wird geladen...');

      // Dynamically import Transformers.js
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1/dist/transformers.min.js');

      // Configure for browser use
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      this.updateProgress(70, 'Zero-shot Klassifizierer wird geladen...');

      // Use a lightweight zero-shot classification model
      this.pipeline = await pipeline(
        'zero-shot-classification',
        'Xenova/mobilebert-uncased-mnli',
        {
          progress_callback: (progress) => {
            if (progress.status === 'downloading') {
              const percent = 70 + (progress.progress || 0) * 0.25;
              this.updateProgress(percent, `Modell wird heruntergeladen... ${Math.round(progress.progress * 100)}%`);
            }
          }
        }
      );

      this.updateProgress(95, 'ML-Modell bereit');
    } catch (error) {
      console.warn('ML model initialization failed, using keyword-only classification:', error);
      this.useMLModel = false;
    }
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
   * Classify a document based on OCR results
   * @param {Object} ocrResult - OCR result from ocrService
   * @returns {Promise<Object>} Classification result
   */
  async classify(ocrResult) {
    const { text, confidence: ocrConfidence } = ocrResult;
    const structuredData = ocrResult.structuredData || this.extractStructuredData(text);

    // Start with keyword-based classification
    let result = this.keywordClassify(text, structuredData);

    // If confidence is low and ML is available, use ML for refinement
    if (result.confidence < 0.6 && this.useMLModel && this.pipeline) {
      const mlResult = await this.mlClassify(text);
      if (mlResult.confidence > result.confidence) {
        result = mlResult;
      }
    }

    // Generate document name
    result.name = this.generateDocumentName(result.category, structuredData, text);

    // Add extracted data
    result.date = this.extractBestDate(structuredData.dates);
    result.amount = structuredData.amounts[0] || null;
    result.sender = structuredData.sender;

    return result;
  }

  /**
   * Keyword-based classification
   * @param {string} text - OCR text
   * @param {Object} structuredData - Extracted structured data
   * @returns {Object} Classification result
   */
  keywordClassify(text, structuredData) {
    const textLower = text.toLowerCase();

    // Category scoring based on keywords
    const scores = {
      // Finanzen
      'fin-gehalt': 0,
      'fin-steuer': 0,
      'fin-bauspar': 0,
      'fin-dkb': 0,
      'fin-haspa': 0,
      'fin-depot': 0,
      'fin-bav': 0,
      'fin-kreditkarte': 0,
      // Rechnungen
      'rechnung': 0,
      // Verträge
      'vertrag-erdgas': 0,
      'vertrag-mobilfunk': 0,
      'vertrag-internet': 0,
      'vertrag-strom': 0,
      // Versicherungen
      'vers-auto': 0,
      'vers-bu': 0,
      'vers-rente': 0,
      'vers-haftpflicht': 0,
      'vers-hausrat': 0,
      'vers-kranken': 0,
      'vers-kuendigung': 0,
      'vers-rechtsschutz': 0,
      'vers-reise': 0,
      'vers-risiko-jan': 0,
      'vers-wohngebaeude': 0,
      'vers-zahn': 0,
      // Weitere
      'medizin': 0,
      'ehe': 0,
      'kind-salome': 0,
      'kind-david': 0,
      'other': 0.1
    };

    // High-confidence keywords (strong indicators)
    const strongKeywords = {
      // Finanzen
      'fin-gehalt': ['gehaltsabrechnung', 'entgeltabrechnung', 'lohnabrechnung', 'bruttolohn', 'nettolohn', 'arbeitgeber'],
      'fin-steuer': ['finanzamt', 'steuerbescheid', 'einkommensteuer', 'steuernummer', 'elster', 'steuererklärung', 'lohnsteuer'],
      'fin-bauspar': ['bausparkasse', 'bausparvertrag', 'schwäbisch hall', 'wüstenrot', 'bausparsumme'],
      'fin-dkb': ['deutsche kreditbank', 'dkb'],
      'fin-haspa': ['hamburger sparkasse', 'haspa'],
      'fin-depot': ['wertpapierdepot', 'depot', 'aktien', 'wertpapier', 'fonds', 'etf', 'dividende'],
      'fin-bav': ['betriebliche altersvorsorge', 'direktversicherung', 'pensionskasse', 'unterstützungskasse'],
      'fin-kreditkarte': ['kreditkartenabrechnung', 'visa', 'mastercard', 'kreditkarte'],
      // Rechnungen
      'rechnung': ['rechnung', 'rechnungsnummer', 'rechnungsbetrag', 'zahlungsziel', 'invoice'],
      // Verträge
      'vertrag-erdgas': ['erdgas', 'gasvertrag', 'gaslieferung', 'stadtwerke'],
      'vertrag-mobilfunk': ['mobilfunk', 'handyvertrag', 'telekom', 'vodafone', 'o2', 'congstar', 'simkarte'],
      'vertrag-internet': ['internetvertrag', 'dsl', 'glasfaser', 'router', 'telefonanschluss'],
      'vertrag-strom': ['stromvertrag', 'stromlieferung', 'kwh', 'stromzähler', 'vattenfall', 'eon'],
      // Versicherungen
      'vers-auto': ['kfz-versicherung', 'autoversicherung', 'haftpflicht kfz', 'teilkasko', 'vollkasko', 'e-scooter'],
      'vers-bu': ['berufsunfähigkeit', 'bu-versicherung', 'erwerbsminderung'],
      'vers-rente': ['deutsche rentenversicherung', 'rentenversicherung', 'rentenbescheid', 'versicherungsnummer'],
      'vers-haftpflicht': ['privathaftpflicht', 'haftpflichtversicherung', 'personenschaden', 'sachschaden'],
      'vers-hausrat': ['hausratversicherung', 'hausrat', 'einbruchdiebstahl', 'brandschaden'],
      'vers-kranken': ['krankenversicherung', 'krankenkasse', 'tk', 'aok', 'barmer', 'dak', 'versichertenkarte'],
      'vers-kuendigung': ['kündigung', 'kündigungsbestätigung', 'versicherung gekündigt'],
      'vers-rechtsschutz': ['rechtsschutzversicherung', 'rechtsschutz', 'anwaltskosten'],
      'vers-reise': ['reiserücktritt', 'reisekranken', 'auslandskranken', 'reiseversicherung'],
      'vers-risiko-jan': ['risikolebensversicherung', 'todesfallleistung'],
      'vers-wohngebaeude': ['wohngebäudeversicherung', 'gebäudeversicherung', 'elementarschaden'],
      'vers-zahn': ['zahnzusatzversicherung', 'zahnersatz', 'zahnbehandlung'],
      // Weitere
      'medizin': ['diagnose', 'patient', 'arztpraxis', 'rezept', 'befund', 'krankenhaus', 'überweisung'],
      'ehe': ['heiratsurkunde', 'eheurkunde', 'standesamt', 'trauung', 'eheschließung'],
      'kind-salome': ['salomé', 'salome'],
      'kind-david': ['david']
    };

    // Medium-confidence keywords
    const mediumKeywords = {
      'fin-gehalt': ['gehalt', 'lohn', 'vergütung', 'sozialversicherung'],
      'fin-steuer': ['steuer', 'abgabe', 'einkommen', 'bescheid'],
      'rechnung': ['betrag', 'mwst', 'netto', 'brutto', 'fällig', 'zahlen'],
      'medizin': ['arzt', 'medizin', 'behandlung', 'gesundheit', 'therapie', 'praxis']
    };

    // Score strong keywords (weight: 3)
    for (const [category, keywords] of Object.entries(strongKeywords)) {
      for (const keyword of keywords) {
        if (textLower.includes(keyword)) {
          scores[category] += 3;
        }
      }
    }

    // Score medium keywords (weight: 1)
    for (const [category, keywords] of Object.entries(mediumKeywords)) {
      for (const keyword of keywords) {
        if (textLower.includes(keyword)) {
          scores[category] += 1;
        }
      }
    }

    // Bonus for extracted data patterns
    if (structuredData.amounts.length > 0) {
      scores['rechnung'] += 1;
    }

    // Find best category
    let bestCategory = 'other';
    let bestScore = 0;
    let totalScore = 0;

    for (const [category, score] of Object.entries(scores)) {
      totalScore += score;
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }

    // Calculate confidence (normalized)
    const confidence = totalScore > 0 ? Math.min(bestScore / Math.max(totalScore * 0.5, 5), 1) : 0.1;

    return {
      category: bestCategory,
      confidence,
      scores,
      method: 'keyword'
    };
  }

  /**
   * ML-based classification (zero-shot)
   * @param {string} text - OCR text
   * @returns {Promise<Object>} Classification result
   */
  async mlClassify(text) {
    if (!this.pipeline) {
      return { category: 'other', confidence: 0, method: 'ml-unavailable' };
    }

    // Truncate text to avoid model limits
    const truncatedText = text.slice(0, 1000);

    // German category labels for zero-shot classification
    const candidateLabels = [
      'Rechnung oder Zahlungsaufforderung',
      'Gehaltsabrechnung oder Lohnzettel',
      'Steuerdokument oder Finanzamt',
      'Versicherungsdokument',
      'Medizinisches Dokument oder Arztbrief',
      'Bankdokument oder Kontoauszug',
      'Vertrag oder Vereinbarung'
    ];

    // Map ML results to new category IDs
    const categoryMap = [
      'rechnung', 'fin-gehalt', 'fin-steuer',
      'vers-haftpflicht', 'medizin', 'fin-dkb', 'vertrag-strom'
    ];

    try {
      const result = await this.pipeline(truncatedText, candidateLabels, {
        multi_label: false
      });

      const topIndex = candidateLabels.indexOf(result.labels[0]);
      const category = topIndex >= 0 ? categoryMap[topIndex] : 'other';

      return {
        category,
        confidence: result.scores[0],
        allScores: result.labels.map((label, i) => ({
          category: categoryMap[candidateLabels.indexOf(label)] || 'other',
          label,
          score: result.scores[i]
        })),
        method: 'ml'
      };
    } catch (error) {
      console.error('ML classification failed:', error);
      return { category: 'other', confidence: 0, method: 'ml-error' };
    }
  }

  /**
   * Extract structured data from text (backup if not provided)
   */
  extractStructuredData(text) {
    const data = {
      dates: [],
      amounts: [],
      keywords: [],
      sender: null
    };

    // Extract dates
    const datePattern = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/g;
    const dateMatches = text.matchAll(datePattern);
    for (const match of dateMatches) {
      data.dates.push(match[0]);
    }

    // Extract amounts
    const amountPattern = /(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*(?:€|EUR)/gi;
    const amountMatches = text.matchAll(amountPattern);
    for (const match of amountMatches) {
      data.amounts.push(match[0]);
    }

    return data;
  }

  /**
   * Generate a descriptive document name
   * @param {string} category - Document category
   * @param {Object} structuredData - Extracted data
   * @param {string} text - Full OCR text
   * @returns {string} Generated name
   */
  generateDocumentName(category, structuredData, text) {
    // Get category label from config
    const categoryConfig = CONFIG.categories.find(c => c.id === category);
    let name = categoryConfig ? categoryConfig.label : 'Dokument';

    // Try to add sender/company name
    if (structuredData.sender) {
      const shortSender = structuredData.sender.slice(0, 30).trim();
      name = `${name} ${shortSender}`;
    } else {
      // Try to extract from first few lines
      const lines = text.split('\n').filter(l => l.trim().length > 3);
      if (lines.length > 0) {
        // Look for company-like patterns
        const companyMatch = lines[0].match(/^([A-Za-zäöüÄÖÜß\s&.-]{3,25})/);
        if (companyMatch) {
          name = `${name} ${companyMatch[1].trim()}`;
        }
      }
    }

    // Add amount if it's an invoice
    if (category === 'rechnung' && structuredData.amounts.length > 0) {
      // Use the largest amount
      const amounts = structuredData.amounts.map(a => {
        const num = parseFloat(a.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
        return { original: a, value: num };
      }).sort((a, b) => b.value - a.value);

      if (amounts.length > 0) {
        name = `${name} ${amounts[0].original}`;
      }
    }

    return name.slice(0, 60);
  }

  /**
   * Extract the most likely document date
   * @param {Array} dates - Array of date strings
   * @returns {string|null} ISO date string or null
   */
  extractBestDate(dates) {
    if (!dates || dates.length === 0) return null;

    const today = new Date();
    let bestDate = null;
    let bestDiff = Infinity;

    for (const dateStr of dates) {
      try {
        let parsed = null;

        // Try DD.MM.YYYY format
        const match = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
        if (match) {
          let year = parseInt(match[3]);
          if (year < 100) {
            year += year > 50 ? 1900 : 2000;
          }
          parsed = new Date(year, parseInt(match[2]) - 1, parseInt(match[1]));
        }

        if (parsed && !isNaN(parsed.getTime())) {
          // Prefer recent dates (within last 2 years)
          const diff = Math.abs(today - parsed);
          const twoYears = 2 * 365 * 24 * 60 * 60 * 1000;

          if (diff < twoYears && diff < bestDiff) {
            bestDiff = diff;
            bestDate = parsed;
          }
        }
      } catch (e) {
        // Skip invalid dates
      }
    }

    if (bestDate) {
      return bestDate.toISOString().split('T')[0];
    }

    return null;
  }

  /**
   * Get alternative category suggestions
   * @param {Object} classificationResult - Result from classify()
   * @returns {Array} Top 3 alternative categories
   */
  getAlternatives(classificationResult) {
    const { scores, category } = classificationResult;

    if (!scores) return [];

    return Object.entries(scores)
      .filter(([cat]) => cat !== category)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, score]) => ({
        category: cat,
        score: score / Math.max(...Object.values(scores), 1)
      }));
  }
}

// Export singleton instance
export const classifier = new DocumentClassifier();
