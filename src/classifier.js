/**
 * SmartScan Document Classifier
 * Keyword-based classification optimised for German financial/personal documents.
 *
 * ML path (Transformers.js zero-shot) is intentionally disabled:
 * the only available lightweight model (mobilebert-uncased-mnli) is English-only
 * and produces unreliable results on German text.
 * TODO: Replace with server-side Ollama classification when backend is available.
 */

import { CONFIG } from './config.js';

// ---------------------------------------------------------------------------
// Regex helpers (module-level, no class dependency)
// ---------------------------------------------------------------------------

/**
 * Escape special regex characters in a literal string.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a word-boundary regex for a keyword string.
 * Multi-word phrases get \b only on the outer boundaries.
 * @param {string} keyword
 * @returns {RegExp}
 */
function buildKeywordRegex(keyword) {
  return new RegExp('\\b' + escapeRegex(keyword) + '\\b', 'i');
}

/**
 * Return the original keyword list plus ae/oe/ue/ss umlaut-substitution variants.
 * This handles common OCR misreads of ä → ae, ö → oe, ü → ue, ß → ss
 * without mutating the source text (which could introduce other errors).
 * @param {string[]} keywords
 * @returns {string[]}
 */
function withUmlautVariants(keywords) {
  const result = [];
  for (const kw of keywords) {
    result.push(kw);
    const variant = kw
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/Ä/g, 'Ae')
      .replace(/Ö/g, 'Oe')
      .replace(/Ü/g, 'Ue');
    if (variant !== kw) {
      result.push(variant);
    }
  }
  return result;
}

/**
 * Pre-compile an array of keyword strings into {keyword, regex} objects.
 * Umlaut variants are added before compilation.
 * @param {string[]} keywords
 * @returns {Array<{keyword: string, regex: RegExp}>}
 */
function compileKeywords(keywords) {
  return withUmlautVariants(keywords).map(kw => ({
    keyword: kw,
    regex: buildKeywordRegex(kw)
  }));
}

// ---------------------------------------------------------------------------
// Raw keyword definitions
// ---------------------------------------------------------------------------

/**
 * Phrase keywords — weight 5 (highest tier).
 * Checked in a dedicated pass before regular keyword scoring.
 */
const RAW_PHRASE_KEYWORDS = {
  'insurance-vehicle':   ['kfz versicherung', 'kfz haftpflicht', 'kfz schein', 'kraftfahrzeug versicherung'],
  'insurance-health':    ['gesetzliche krankenversicherung', 'private krankenversicherung', 'gkv beitrag', 'pkv beitrag'],
  'insurance-liability': ['private haftpflicht', 'privathaftpflicht versicherung'],
  'contract-utility':    ['strom und gas', 'jahresabrechnung strom', 'erdgas lieferung', 'gaslieferung', 'stromlieferung'],
  'contract-telecom':    ['mobilfunk vertrag', 'internet vertrag', 'dsl vertrag', 'laufzeit monat'],
  'tax':                 ['einkommensteuer bescheid', 'steuerliche identifikationsnummer', 'steuer id', 'finanzamt bescheid'],
  'payslip':             ['brutto netto abrechnung', 'sozialversicherungspflichtiges brutto', 'lohn und gehaltsabrechnung'],
  'savings':             ['vermögenswirksame leistungen', 'betriebliche altersvorsorge', 'riester rente', 'rürup rente'],
  'bank':                ['kontoauszug nr', 'iban bic', 'überweisungsbeleg'],
  'medical':             ['ärztliche bescheinigung', 'medizinische bescheinigung', 'arztbrief', 'entlassungsbrief']
};

/**
 * Strong keywords — weight 3.
 */
const RAW_STRONG_KEYWORDS = {
  'payslip': [
    'gehaltsabrechnung', 'entgeltabrechnung', 'lohnabrechnung', 'bruttolohn',
    'nettolohn', 'lohnzettel', 'entgeltnachweis', 'gehaltsnachweis'
  ],
  'bank': [
    'kontoauszug', 'girokonto', 'kreditkartenabrechnung', 'visa', 'mastercard',
    'kreditkarte', 'iban', 'bic', 'kontonummer', 'sparkasse', 'volksbank',
    'commerzbank', 'postbank', 'deutsche bank'
  ],
  'investment': [
    'wertpapierdepot', 'depotauszug', 'aktien', 'wertpapier', 'fonds', 'etf',
    'dividende', 'fondsanteil', 'depotnummer'
  ],
  'tax': [
    'finanzamt', 'steuerbescheid', 'einkommensteuer', 'steuernummer', 'elster',
    'steuererklärung', 'lohnsteuer', 'umsatzsteuererklärung'
  ],
  'savings': [
    'bausparkasse', 'bausparvertrag', 'bausparsumme', 'betriebliche altersvorsorge',
    'direktversicherung', 'pensionskasse', 'altersvorsorge', 'riester', 'rürup'
  ],
  'invoice': [
    'rechnung', 'rechnungsnummer', 'rechnungsbetrag', 'zahlungsziel', 'invoice',
    'faktura', 'ust-id', 'umsatzsteuer-id'
  ],
  'receipt': [
    'quittung', 'kassenbon', 'kassenbeleg', 'kassierbon', 'bar bezahlt',
    'barzahlung', 'bargeldzahlung'
  ],
  'contract-utility': [
    'erdgas', 'gasvertrag', 'gaslieferung', 'stromvertrag', 'stromlieferung',
    'kwh', 'stromzähler', 'energieversorger', 'wasserversorgung', 'fernwärme'
  ],
  'contract-telecom': [
    'mobilfunkvertrag', 'handyvertrag', 'simkarte', 'dsl-vertrag',
    'glasfaservertrag', 'internetvertrag', 'telefonanschluss', 'mobilfunk'
  ],
  'contract-general': [
    'mietvertrag', 'kaufvertrag', 'dienstleistungsvertrag',
    'geschäftsbedingungen', 'vertragsunterlagen'
  ],
  'insurance-health': [
    'krankenversicherung', 'krankenkasse', 'gesetzliche krankenversicherung',
    'gkv', 'pkv', 'versichertenkarte', 'krankenversichertennummer'
  ],
  'insurance-vehicle': [
    'kfz-versicherung', 'autoversicherung', 'fahrzeugversicherung',
    'teilkasko', 'vollkasko', 'kraftfahrzeughaftpflicht'
  ],
  'insurance-liability': [
    'privathaftpflicht', 'haftpflichtversicherung', 'personenschaden',
    'sachschaden', 'haftpflichtschaden'
  ],
  'insurance-other': [
    'berufsunfähigkeitsversicherung', 'risikolebensversicherung',
    'lebensversicherung', 'hausratversicherung', 'rechtsschutzversicherung',
    'reiseversicherung', 'zahnzusatzversicherung', 'wohngebäudeversicherung',
    'todesfallleistung', 'versicherungsschein', 'versicherungspolice'
  ],
  'medical': [
    'diagnose', 'patient', 'arztpraxis', 'rezept', 'befund', 'krankenhaus',
    'attest', 'laborergebnis', 'überweisung arzt', 'arztbrief'
  ],
  'official': [
    'ausweis', 'reisepass', 'geburtsurkunde', 'heiratsurkunde', 'standesamt',
    'meldebescheinigung', 'abschlusszeugnis', 'immatrikulationsbescheinigung',
    'aufenthaltstitel', 'personalausweis'
  ]
};

/**
 * Medium keywords — weight 1.
 * R3 adds arrays for the 6 previously-empty categories.
 */
const RAW_MEDIUM_KEYWORDS = {
  'payslip': ['gehalt', 'lohn', 'vergütung', 'sozialversicherung', 'arbeitgeber', 'arbeitnehmer'],
  'bank': ['bank', 'konto', 'guthaben', 'saldo', 'überweisung', 'zinsen'],
  'tax': ['steuer', 'abgabe', 'einkommen', 'bescheid', 'finanzamt'],
  'invoice': ['betrag', 'mwst', 'netto', 'brutto', 'fällig', 'zahlen', 'zahlbar', 'rechnungsdatum'],
  'receipt': ['beleg', 'quittung', 'bar', 'bezahlt'],
  'contract-general': ['vertrag', 'vereinbarung', 'unterschrift', 'laufzeit', 'kündigung'],
  'insurance-other': ['versicherung', 'police', 'prämie', 'versicherungsbeitrag'],
  'medical': ['arzt', 'medizin', 'behandlung', 'gesundheit', 'therapie', 'praxis'],
  'official': ['bescheinigung', 'zeugnis', 'urkunde', 'amt', 'behörde'],
  // R3 additions — previously missing medium keyword arrays
  'investment': [
    'rendite', 'anlage', 'portfolio', 'kurs', 'börse', 'sparplan',
    'kapitalertrag', 'depot', 'wertpapier', 'aktie', 'fonds', 'etf'
  ],
  'savings': [
    'sparen', 'sparrate', 'zinsen', 'einzahlung', 'guthaben', 'ansparphase',
    'tilgung', 'bausparen', 'bausparvertrag', 'riester'
  ],
  'contract-utility': [
    'verbrauch', 'zählerstand', 'abschlag', 'jahresabrechnung', 'energie',
    'grundpreis', 'arbeitspreis', 'versorger', 'kwh', 'lieferung'
  ],
  'contract-telecom': [
    'tarif', 'datenvolumen', 'flatrate', 'rufnummer', 'vertragslaufzeit',
    'anschluss', 'router', 'bandbreite', 'minuten', 'sms'
  ],
  'insurance-health': [
    'beitrag', 'zusatzversicherung', 'selbstbeteiligung', 'leistungsabrechnung',
    'versicherungsnehmer', 'krankengeld', 'ambulant', 'stationär'
  ],
  'insurance-vehicle': [
    'fahrzeug', 'kennzeichen', 'schadensfreiheitsklasse', 'sf-klasse',
    'zulassung', 'typschlüssel', 'haftpflicht', 'vollkasko', 'teilkasko'
  ],
  'insurance-liability': [
    'deckungssumme', 'schadensfall', 'haftung', 'schadensmeldung',
    'regulierung', 'privathaftpflicht', 'schadensersatz'
  ]
};

// ---------------------------------------------------------------------------
// DocumentClassifier
// ---------------------------------------------------------------------------

/**
 * Document Classifier class.
 * Uses keyword-based classification with margin-based confidence scoring.
 * All keyword regexes are pre-compiled during init() for performance.
 */
class DocumentClassifier {
  constructor() {
    this.isReady = false;
    // useMLModel is hardcoded false — see module-level comment.
    this.useMLModel = false;
    this.pipeline = null;
    this.loadProgress = 0;
    this.onProgress = null;

    // Compiled keyword maps — populated in _compileKeywords()
    this._phraseKeywords = {};   // { category: [{keyword, regex}] }
    this._strongKeywords = {};
    this._mediumKeywords = {};
  }

  /**
   * Initialize classifier.
   * @param {Object} options
   * @param {boolean} [options.useML=false] - Ignored; ML is disabled (see module comment).
   * @param {Function} [options.onProgress] - Progress callback (percent, statusText).
   */
  async init(options = {}) {
    if (this.isReady) return;

    const { onProgress = null } = options;
    // useML option is accepted for API compatibility but always treated as false.
    this.useMLModel = false;
    this.onProgress = onProgress;

    this.updateProgress(50, 'Klassifizierer wird initialisiert...');
    this._compileKeywords();
    this.isReady = true;
    this.updateProgress(100, 'Klassifizierer bereit');
  }

  /**
   * Pre-compile all keyword regexes from the raw definition objects.
   * Must be called once during init().
   * @private
   */
  _compileKeywords() {
    for (const [cat, kws] of Object.entries(RAW_PHRASE_KEYWORDS)) {
      this._phraseKeywords[cat] = compileKeywords(kws);
    }
    for (const [cat, kws] of Object.entries(RAW_STRONG_KEYWORDS)) {
      this._strongKeywords[cat] = compileKeywords(kws);
    }
    for (const [cat, kws] of Object.entries(RAW_MEDIUM_KEYWORDS)) {
      this._mediumKeywords[cat] = compileKeywords(kws);
    }
  }

  /**
   * Update progress callback.
   * @private
   */
  updateProgress(percent, status) {
    this.loadProgress = percent;
    if (this.onProgress) {
      this.onProgress(percent, status);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Classify a document based on OCR results.
   * Return signature is identical to the previous implementation.
   * @param {Object} ocrResult - OCR result from ocrService
   * @param {string} ocrResult.text
   * @param {number} ocrResult.confidence
   * @param {Object} [ocrResult.structuredData]
   * @returns {Promise<Object>} { category, confidence, scores, extractedData, name, date, amount, sender }
   */
  async classify(ocrResult) {
    const { text } = ocrResult;
    const structuredData = ocrResult.structuredData || this.extractStructuredData(text);

    const result = this.keywordClassify(text, structuredData);

    // ML path intentionally skipped — useMLModel is always false.
    // TODO: Replace with server-side Ollama classification when backend is available.

    result.name = this.generateDocumentName(result.category, structuredData, text);
    result.date = this.extractBestDate(structuredData.dates);
    result.amount = structuredData.amounts[0] || null;
    result.sender = structuredData.sender;

    return result;
  }

  // ---------------------------------------------------------------------------
  // Keyword classification
  // ---------------------------------------------------------------------------

  /**
   * Normalise OCR text before keyword matching.
   * - Rejoins hyphenated line breaks (e.g. "Versiche-\nrung" → "Versicherung")
   * - Collapses multiple whitespace/newlines to a single space
   * @param {string} text
   * @returns {string}
   */
  normalizeOCRText(text) {
    return text
      .replace(/(\w+)-\n(\w+)/g, '$1$2')
      .replace(/\s+/g, ' ');
  }

  /**
   * Core keyword-based classification.
   * Scoring order: phrase keywords (weight 5) → strong keywords (weight 3) →
   * medium keywords (weight 1) → disambiguation rules → margin-based confidence.
   * @param {string} text - Raw OCR text
   * @param {Object} structuredData - Extracted structured data
   * @returns {Object} { category, confidence, scores, method }
   */
  keywordClassify(text, structuredData) {
    const textNorm = this.normalizeOCRText(text);

    // Initialise score map — mirrors DOCUMENT_CATEGORIES in config.js
    const scores = {
      'payslip':             0,
      'bank':                0,
      'investment':          0,
      'tax':                 0,
      'savings':             0,
      'invoice':             0,
      'receipt':             0,
      'contract-utility':    0,
      'contract-telecom':    0,
      'contract-general':    0,
      'insurance-health':    0,
      'insurance-vehicle':   0,
      'insurance-liability': 0,
      'insurance-other':     0,
      'medical':             0,
      'official':            0,
      'other':               0.1
    };

    // Pass 1 — phrase keywords (weight 5)
    for (const [category, compiled] of Object.entries(this._phraseKeywords)) {
      for (const { regex } of compiled) {
        if (regex.test(textNorm)) {
          scores[category] += 5;
        }
      }
    }

    // Pass 2 — strong keywords (weight 3)
    for (const [category, compiled] of Object.entries(this._strongKeywords)) {
      for (const { regex } of compiled) {
        if (regex.test(textNorm)) {
          scores[category] += 3;
        }
      }
    }

    // Pass 3 — medium keywords (weight 1)
    for (const [category, compiled] of Object.entries(this._mediumKeywords)) {
      for (const { regex } of compiled) {
        if (regex.test(textNorm)) {
          scores[category] += 1;
        }
      }
    }

    // Bonus for extracted amounts (mild invoice signal)
    if (structuredData.amounts.length > 0) {
      scores['invoice'] += 1;
    }

    // Pass 4 — co-occurrence disambiguation
    this.applyDisambiguationRules(textNorm, scores);

    // Find best and second-best scores
    let bestCategory = 'other';
    let bestScore = 0;
    let secondBestScore = 0;

    for (const [category, score] of Object.entries(scores)) {
      if (score > bestScore) {
        secondBestScore = bestScore;
        bestScore = score;
        bestCategory = category;
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }

    // Margin-based confidence (R4)
    const confidence = this._marginConfidence(bestScore, secondBestScore);

    return {
      category: bestCategory,
      confidence,
      scores,
      method: 'keyword'
    };
  }

  /**
   * Convert a best/second-best score pair to a confidence value.
   * @private
   * @param {number} bestScore
   * @param {number} secondBestScore
   * @returns {number} confidence in [0.10, 0.95]
   */
  _marginConfidence(bestScore, secondBestScore) {
    if (bestScore === 0) return 0.10;
    const margin = bestScore - secondBestScore;
    if (margin >= 8) return 0.95;
    if (margin >= 5) return 0.85;
    if (margin >= 3) return 0.70;
    if (margin >= 1) return 0.50;
    return 0.25; // margin === 0 → tied
  }

  // ---------------------------------------------------------------------------
  // Disambiguation rules (R2)
  // ---------------------------------------------------------------------------

  /**
   * Apply co-occurrence rules to adjust scores after initial keyword matching.
   * Rules boost the most-specific category and lightly penalise the catch-all.
   * Mutates the scores object in place.
   * @param {string} textNorm - Normalised lowercase text
   * @param {Object} scores - Mutable scores map
   */
  applyDisambiguationRules(textNorm, scores) {
    // Helper: test a pre-compiled regex or a plain substring
    const has = (pattern) => {
      if (pattern instanceof RegExp) return pattern.test(textNorm);
      return textNorm.includes(pattern);
    };

    const versicherung = has('versicherung');
    const vertrag      = has('vertrag');
    const steuer       = has('steuer');
    const konto        = has('konto');

    // insurance-vehicle boost
    if (versicherung && (has('kfz') || has('fahrzeug') || has('kraftfahrzeug') || has('kennzeichen') || has('zulassung'))) {
      scores['insurance-vehicle'] += 4;
      scores['insurance-other']   -= 2;
    }

    // insurance-health boost
    if (versicherung && (has('krankheit') || has('kranken') || has('gesundheit') || has('arzt') || has('behandlung'))) {
      scores['insurance-health'] += 4;
      scores['insurance-other']  -= 2;
    }

    // insurance-liability boost
    if (versicherung && (has('haftpflicht') || has('haftung') || has('schadensersatz'))) {
      scores['insurance-liability'] += 4;
      scores['insurance-other']     -= 2;
    }

    // contract-utility boost
    if (vertrag && (has('strom') || has('gas') || has('wasser') || has('energie') || has('versorger'))) {
      scores['contract-utility'] += 4;
      scores['contract-general'] -= 2;
    }

    // contract-telecom boost
    if (vertrag && (has('telefon') || has('mobil') || has('internet') || has('dsl') || has('funk') || has('handy'))) {
      scores['contract-telecom'] += 4;
      scores['contract-general'] -= 2;
    }

    // invoice vs tax: a document with Steuer AND a Rechnungs-term is more likely an invoice
    if (steuer && (has('rechnung') || has('rechnungsnummer') || has('nettobetrag') || has('bruttobetrag'))) {
      scores['invoice'] += 3;
      scores['tax']     -= 2;
    }

    // bank vs invoice: a document with Konto AND Rechnung terms is more likely an invoice
    if (konto && (has('rechnung') || has('rechnungsnummer'))) {
      scores['invoice'] += 2;
      scores['bank']    -= 1;
    }
  }

  // ---------------------------------------------------------------------------
  // ML stub (disabled)
  // ---------------------------------------------------------------------------

  /**
   * ML-based classification stub.
   * The Transformers.js zero-shot pipeline is disabled because the only
   * lightweight model available (mobilebert-uncased-mnli) is English-only and
   * produces unreliable results on German text.
   * TODO: Replace with server-side Ollama classification when backend is available.
   * @param {string} _text - Unused until Ollama backend is wired in
   * @returns {Promise<Object>}
   */
  async mlClassify(_text) {
    // Dynamic import and pipeline initialisation removed until a
    // German-capable model is available via the Ollama backend.
    return { category: 'other', confidence: 0, method: 'ml-unavailable' };
  }

  // ---------------------------------------------------------------------------
  // Structured data extraction (unchanged)
  // ---------------------------------------------------------------------------

  /**
   * Extract structured data from text (backup if not provided by ocrService).
   * @param {string} text
   * @returns {{ dates: string[], amounts: string[], keywords: string[], sender: null }}
   */
  extractStructuredData(text) {
    const data = {
      dates: [],
      amounts: [],
      keywords: [],
      sender: null
    };

    // Extract dates — DD.MM.YYYY or DD.MM.YY
    const datePattern = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/g;
    for (const match of text.matchAll(datePattern)) {
      data.dates.push(match[0]);
    }

    // Extract Euro amounts
    const amountPattern = /(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*(?:€|EUR)/gi;
    for (const match of text.matchAll(amountPattern)) {
      data.amounts.push(match[0]);
    }

    return data;
  }

  // ---------------------------------------------------------------------------
  // Document naming (unchanged)
  // ---------------------------------------------------------------------------

  /**
   * Generate a descriptive document name.
   * @param {string} category - Document category ID
   * @param {Object} structuredData - Extracted data
   * @param {string} text - Full OCR text
   * @returns {string} Generated name (max 60 chars)
   */
  generateDocumentName(category, structuredData, text) {
    const categoryConfig = CONFIG.categories.find(c => c.id === category);
    let name = categoryConfig ? categoryConfig.label : 'Dokument';

    if (structuredData.sender) {
      const shortSender = structuredData.sender.slice(0, 30).trim();
      name = `${name} ${shortSender}`;
    } else {
      const lines = text.split('\n').filter(l => l.trim().length > 3);
      if (lines.length > 0) {
        const companyMatch = lines[0].match(/^([A-Za-zäöüÄÖÜß\s&.-]{3,25})/);
        if (companyMatch) {
          name = `${name} ${companyMatch[1].trim()}`;
        }
      }
    }

    if (category === 'invoice' && structuredData.amounts.length > 0) {
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

  // ---------------------------------------------------------------------------
  // Date extraction (unchanged)
  // ---------------------------------------------------------------------------

  /**
   * Select the most plausible document date from a list.
   * Prefers dates within the last two years, closest to today.
   * @param {string[]} dates - Array of DD.MM.YYYY strings
   * @returns {string|null} ISO date string or null
   */
  extractBestDate(dates) {
    if (!dates || dates.length === 0) return null;

    const today = new Date();
    const twoYears = 2 * 365 * 24 * 60 * 60 * 1000;
    let bestDate = null;
    let bestDiff = Infinity;

    for (const dateStr of dates) {
      try {
        const match = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
        if (!match) continue;

        let year = parseInt(match[3]);
        if (year < 100) {
          year += year > 50 ? 1900 : 2000;
        }

        const parsed = new Date(year, parseInt(match[2]) - 1, parseInt(match[1]));
        if (!isNaN(parsed.getTime())) {
          const diff = Math.abs(today - parsed);
          if (diff < twoYears && diff < bestDiff) {
            bestDiff = diff;
            bestDate = parsed;
          }
        }
      } catch (_e) {
        // Skip unparseable dates silently
      }
    }

    return bestDate ? bestDate.toISOString().split('T')[0] : null;
  }

  // ---------------------------------------------------------------------------
  // Alternative suggestions (unchanged)
  // ---------------------------------------------------------------------------

  /**
   * Return the top 3 alternative category suggestions from a classification result.
   * @param {Object} classificationResult - Result from classify()
   * @returns {Array<{category: string, score: number}>}
   */
  getAlternatives(classificationResult) {
    const { scores, category } = classificationResult;
    if (!scores) return [];

    const maxScore = Math.max(...Object.values(scores), 1);

    return Object.entries(scores)
      .filter(([cat]) => cat !== category)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, score]) => ({ category: cat, score: score / maxScore }));
  }
}

// Export singleton instance
export const classifier = new DocumentClassifier();
