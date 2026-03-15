/**
 * SmartScan Nextcloud API Integration
 * WebDAV-based file upload and folder management.
 *
 * Users authenticate with their Nextcloud username and an App Password.
 * Generate app passwords in Nextcloud: Settings → Security → App passwords.
 * This way the user's main account password is never stored in the app.
 */

import { CONFIG } from './config.js';

class NextcloudAPI {
  constructor() {
    this.serverUrl = null;   // e.g. https://cloud.example.com
    this.username = null;
    this.appPassword = null;
  }

  /**
   * Load credentials from localStorage and return configured state.
   * @returns {boolean}
   */
  init() {
    this.loadCredentials();
    return this.isConfigured();
  }

  /**
   * Whether all required credentials are present.
   * @returns {boolean}
   */
  isConfigured() {
    return !!(this.serverUrl && this.username && this.appPassword);
  }

  /**
   * Load credentials.
   * URL and username persist in localStorage (not sensitive).
   * App password is session-only (sessionStorage) to limit exposure.
   */
  loadCredentials() {
    this.serverUrl   = localStorage.getItem(CONFIG.storage.nextcloudUrl);
    this.username    = localStorage.getItem(CONFIG.storage.nextcloudUsername);
    this.appPassword = sessionStorage.getItem(CONFIG.storage.nextcloudPassword);
  }

  /**
   * Persist credentials.
   * @param {string} serverUrl   - Must be an https:// URL
   * @param {string} username
   * @param {string} appPassword - Nextcloud app password (not the main password)
   * @throws {Error} if URL is not HTTPS or points to a private/local address
   */
  saveCredentials(serverUrl, username, appPassword) {
    const trimmedUrl = serverUrl.trim().replace(/\/+$/, '');

    // Enforce HTTPS
    if (!trimmedUrl.startsWith('https://')) {
      throw new Error('Nextcloud-Server-URL muss HTTPS verwenden (https://...)');
    }

    // Reject localhost and private IP ranges to prevent credential exfiltration
    try {
      const parsed = new URL(trimmedUrl);
      const host = parsed.hostname;
      if (
        host === 'localhost' || host === '127.0.0.1' || host === '::1' ||
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)
      ) {
        throw new Error('Private oder lokale Adressen sind nicht erlaubt');
      }
    } catch (e) {
      if (e.message.includes('nicht erlaubt')) throw e;
      throw new Error('Ungültige Server-URL');
    }

    this.serverUrl   = trimmedUrl;
    this.username    = username.trim();
    this.appPassword = appPassword.trim();

    localStorage.setItem(CONFIG.storage.nextcloudUrl,      this.serverUrl);
    localStorage.setItem(CONFIG.storage.nextcloudUsername, this.username);
    // Password goes to sessionStorage only — not persisted across browser sessions
    sessionStorage.setItem(CONFIG.storage.nextcloudPassword, this.appPassword);
  }

  /**
   * Remove credentials (disconnect).
   */
  clearCredentials() {
    this.serverUrl   = null;
    this.username    = null;
    this.appPassword = null;

    localStorage.removeItem(CONFIG.storage.nextcloudUrl);
    localStorage.removeItem(CONFIG.storage.nextcloudUsername);
    sessionStorage.removeItem(CONFIG.storage.nextcloudPassword);
  }

  /**
   * Basic Auth header value.
   * Uses TextEncoder to safely handle non-ASCII characters (umlauts, etc.)
   * @returns {string}
   */
  getAuthHeader() {
    const credentials = `${this.username}:${this.appPassword}`;
    // btoa() breaks on non-ASCII — encode via Uint8Array instead
    const bytes = new TextEncoder().encode(credentials);
    const binary = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
    return 'Basic ' + btoa(binary);
  }

  /**
   * WebDAV root for this user.
   * @returns {string}
   */
  getWebDAVBase() {
    return `${this.serverUrl}/remote.php/dav/files/${encodeURIComponent(this.username)}`;
  }

  /**
   * Verify connectivity and credentials via the Nextcloud OCS capabilities endpoint.
   * Uses a plain GET request — no WebDAV methods, CORS-friendly on all versions.
   * @returns {Promise<{displayName: string, server: string, version: string}>}
   * @throws {Error} on auth failure or network error
   */
  async testConnection() {
    if (!this.isConfigured()) {
      throw new Error('Nextcloud nicht konfiguriert');
    }

    // Mixed-content check: HTTPS app cannot load HTTP resources
    if (location.protocol === 'https:' && this.serverUrl.startsWith('http:')) {
      throw new Error(
        'Gemischte Inhalte blockiert: Die App läuft über HTTPS, aber die Nextcloud-URL verwendet HTTP. ' +
        'Bitte eine HTTPS-URL für den Nextcloud-Server verwenden.'
      );
    }

    // OCS capabilities: standard GET, works cross-origin without special CORS headers
    const url = `${this.serverUrl}/ocs/v2.php/cloud/capabilities?format=json`;

    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
          'OCS-APIRequest': 'true'  // Required by Nextcloud OCS endpoints
        }
      });
    } catch (networkError) {
      // fetch() throws TypeError on network-level failures (CORS, DNS, SSL, offline)
      const isHttps = location.protocol === 'https:';
      throw new Error(
        'Verbindung zum Nextcloud-Server nicht möglich.\n' +
        'Mögliche Ursachen:\n' +
        '• CORS nicht konfiguriert: In der Nextcloud config.php muss ' +
        `"cors.allowed-domains" die Adresse dieser App (${location.origin}) enthalten.\n` +
        (isHttps ? '• SSL-Zertifikat ungültig oder selbst signiert.\n' : '') +
        '• Server nicht erreichbar oder URL falsch.\n\n' +
        `Technischer Fehler: ${networkError.message}`
      );
    }

    if (response.status === 401) {
      throw new Error('Ungültige Anmeldedaten – bitte Benutzername und App-Passwort prüfen');
    }
    if (response.status === 404) {
      throw new Error('Nextcloud nicht gefunden – bitte Server-URL prüfen');
    }
    if (!response.ok) {
      throw new Error(`Verbindung fehlgeschlagen: HTTP ${response.status}`);
    }

    const data = await response.json();
    const version = data?.ocs?.data?.version?.string || 'Unbekannt';

    return { displayName: this.username, server: this.serverUrl, version };
  }

  /**
   * Create a path and all intermediate folders.
   * @param {string} path - e.g. /SmartScan/Rechnungen
   */
  async createFolder(path) {
    const parts = path.split('/').filter(p => p.length > 0);
    let current = '';
    for (const part of parts) {
      current += '/' + part;
      await this.createSingleFolder(current);
    }
  }

  /**
   * Create a single folder; silently ignores "already exists".
   * @param {string} path
   */
  async createSingleFolder(path) {
    const url = this.getWebDAVBase() + path;
    const response = await fetch(url, {
      method: 'MKCOL',
      headers: { 'Authorization': this.getAuthHeader() }
    });

    // 201 Created, 405 Method Not Allowed (already exists), 409 Conflict — all acceptable
    if (response.status !== 201 && response.status !== 405 && response.status !== 409) {
      console.warn(`MKCOL ${path} returned ${response.status}`);
    }
  }

  /**
   * Upload a file via WebDAV PUT.
   * @param {Blob|ArrayBuffer} content  - File data
   * @param {string}           path     - Destination path including filename,
   *                                      e.g. /SmartScan/Rechnungen/2024-01-15_doc.pdf
   * @returns {Promise<{path: string}>}
   */
  async uploadFile(content, path) {
    if (!this.isConfigured()) {
      throw new Error('Nicht mit Nextcloud verbunden');
    }
    if (!content) {
      throw new Error('Kein Inhalt zum Hochladen');
    }

    // Mixed-content check applies to every upload, not just testConnection
    if (location.protocol === 'https:' && this.serverUrl.startsWith('http:')) {
      throw new Error(
        'Gemischte Inhalte blockiert: Die App läuft über HTTPS, aber die Nextcloud-URL verwendet HTTP.'
      );
    }

    // Ensure parent folder exists
    const folderPath = path.substring(0, path.lastIndexOf('/'));
    if (folderPath) {
      await this.createFolder(folderPath);
    }

    const url = this.getWebDAVBase() + path;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/pdf'
      },
      body: content
    });

    if (response.status === 401) {
      throw new Error('Nextcloud: Ungültige Anmeldedaten');
    }
    if (!response.ok) {
      throw new Error(`Nextcloud Upload fehlgeschlagen: HTTP ${response.status}`);
    }

    return { path };
  }

  /**
   * Basic display info about the connected account.
   * @returns {{displayName: string, server: string}|null}
   */
  getUserInfo() {
    if (!this.isConfigured()) return null;
    return { displayName: this.username, server: this.serverUrl };
  }
}

// Export singleton instance
export const nextcloudAPI = new NextcloudAPI();
