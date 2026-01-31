/**
 * SmartScan Claude API Integration
 * Document analysis using Claude's vision capabilities
 */

import { CONFIG } from './config.js';
import { sleep } from './utils.js';

/**
 * Claude API client for document analysis
 */
class ClaudeAPI {
  constructor() {
    this.apiKey = null;
  }

  /**
   * Initialize the API client
   */
  init() {
    this.loadApiKey();
    return this.isConfigured();
  }

  /**
   * Check if API is configured
   * @returns {boolean}
   */
  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Load API key from storage
   */
  loadApiKey() {
    this.apiKey = localStorage.getItem(CONFIG.storage.claudeApiKey);
  }

  /**
   * Save API key to storage
   * @param {string} key
   */
  setApiKey(key) {
    // Trim whitespace and remove any line breaks
    const cleanKey = key ? key.trim().replace(/[\r\n]/g, '') : null;
    this.apiKey = cleanKey;
    if (cleanKey) {
      localStorage.setItem(CONFIG.storage.claudeApiKey, cleanKey);
    } else {
      localStorage.removeItem(CONFIG.storage.claudeApiKey);
    }
  }

  /**
   * Clear stored API key
   */
  clearApiKey() {
    this.apiKey = null;
    localStorage.removeItem(CONFIG.storage.claudeApiKey);
  }

  /**
   * Analyze a document image
   * @param {string} base64Image - Base64 encoded image (without data: prefix)
   * @param {string} mediaType - Image MIME type (e.g., 'image/jpeg')
   * @returns {Promise<Object>} Analysis result with category, date, name, etc.
   */
  async analyzeDocument(base64Image, mediaType = 'image/jpeg') {
    if (!this.apiKey) {
      throw new Error('Claude API Key nicht konfiguriert');
    }

    const prompt = `Analysiere dieses Dokument und extrahiere die folgenden Informationen. Antworte NUR mit einem JSON-Objekt, keine andere Formatierung oder Text.

Das JSON-Objekt muss diese Felder haben:
{
  "category": "Eine der folgenden Kategorien: invoice, receipt, contract, letter, tax, insurance, medical, bank, warranty, other",
  "date": "Das Datum des Dokuments im Format YYYY-MM-DD (falls erkennbar, sonst null)",
  "name": "Ein aussagekräftiger Name für das Dokument auf Deutsch (z.B. 'Stromrechnung Januar 2024', 'Mietvertrag', 'Arztrechnung')",
  "sender": "Der Absender/Aussteller des Dokuments (falls erkennbar, sonst null)",
  "amount": "Der Gesamtbetrag falls vorhanden (als String, z.B. '123,45 €', sonst null)",
  "confidence": "Deine Konfidenz in der Analyse als Zahl von 0 bis 1"
}

Kategorien:
- invoice: Rechnungen (Strom, Gas, Telefon, Online-Shops, etc.)
- receipt: Kassenbelege, Quittungen
- contract: Verträge aller Art
- letter: Briefe, Schreiben
- tax: Steuerbescheide, Steuererklärungen
- insurance: Versicherungspolicen, Schadensmeldungen
- medical: Arztbriefe, Rezepte, Krankenkasse
- bank: Kontoauszüge, Kreditverträge
- warranty: Garantiescheine, Kaufbelege für Garantie
- other: Alles andere

Wichtig:
- Antworte NUR mit dem JSON-Objekt
- Verwende deutsche Bezeichnungen für den Namen
- Das Datum sollte im ISO-Format sein (YYYY-MM-DD)`;

    const requestBody = {
      model: CONFIG.claude.model,
      max_tokens: CONFIG.claude.maxTokens,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ]
    };

    let lastError;

    // Retry with exponential backoff
    for (let attempt = 0; attempt < CONFIG.claude.retryAttempts; attempt++) {
      try {
        const response = await fetch(CONFIG.claude.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify(requestBody)
        });

        if (response.status === 429) {
          // Rate limited, wait and retry
          const delay = CONFIG.claude.retryDelay * Math.pow(2, attempt);
          console.warn(`Rate limited, retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.error?.message || `API error: ${response.status}`);
        }

        const data = await response.json();

        // Extract text content from response
        const textContent = data.content?.find(c => c.type === 'text');
        if (!textContent?.text) {
          throw new Error('No text response from API');
        }

        // Parse JSON from response
        const result = this.parseJsonResponse(textContent.text);

        // Validate required fields
        if (!result.category || !result.name) {
          throw new Error('Invalid response structure');
        }

        return result;

      } catch (error) {
        lastError = error;
        if (attempt < CONFIG.claude.retryAttempts - 1) {
          const delay = CONFIG.claude.retryDelay * Math.pow(2, attempt);
          await sleep(delay);
        }
      }
    }

    throw lastError || new Error('Document analysis failed');
  }

  /**
   * Parse JSON from Claude's response
   * Handles various response formats (with/without code blocks, etc.)
   * @param {string} text - Response text
   * @returns {Object} Parsed JSON object
   */
  parseJsonResponse(text) {
    // Try to extract JSON from code blocks first
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      text = codeBlockMatch[1].trim();
    }

    // Try to find JSON object in text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      text = jsonMatch[0];
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      console.error('Failed to parse JSON response:', text);
      throw new Error('Failed to parse API response as JSON');
    }
  }
}

// Export singleton instance
export const claudeAPI = new ClaudeAPI();
