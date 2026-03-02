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
   * Load credentials from localStorage.
   */
  loadCredentials() {
    this.serverUrl   = localStorage.getItem(CONFIG.storage.nextcloudUrl);
    this.username    = localStorage.getItem(CONFIG.storage.nextcloudUsername);
    this.appPassword = localStorage.getItem(CONFIG.storage.nextcloudPassword);
  }

  /**
   * Persist credentials to localStorage.
   * @param {string} serverUrl   - e.g. https://cloud.example.com
   * @param {string} username
   * @param {string} appPassword - Nextcloud app password (not the main password)
   */
  saveCredentials(serverUrl, username, appPassword) {
    this.serverUrl   = serverUrl.replace(/\/+$/, ''); // strip trailing slash
    this.username    = username.trim();
    this.appPassword = appPassword.trim();

    localStorage.setItem(CONFIG.storage.nextcloudUrl,      this.serverUrl);
    localStorage.setItem(CONFIG.storage.nextcloudUsername, this.username);
    localStorage.setItem(CONFIG.storage.nextcloudPassword, this.appPassword);
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
    localStorage.removeItem(CONFIG.storage.nextcloudPassword);
  }

  /**
   * Basic Auth header value.
   * @returns {string}
   */
  getAuthHeader() {
    return 'Basic ' + btoa(`${this.username}:${this.appPassword}`);
  }

  /**
   * WebDAV root for this user.
   * @returns {string}
   */
  getWebDAVBase() {
    return `${this.serverUrl}/remote.php/dav/files/${encodeURIComponent(this.username)}`;
  }

  /**
   * Verify connectivity and credentials with a lightweight PROPFIND.
   * @returns {Promise<{displayName: string, server: string}>}
   * @throws {Error} on auth failure or network error
   */
  async testConnection() {
    if (!this.isConfigured()) {
      throw new Error('Nextcloud nicht konfiguriert');
    }

    const response = await fetch(this.getWebDAVBase() + '/', {
      method: 'PROPFIND',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Depth': '0'
      }
    });

    if (response.status === 401) {
      throw new Error('Ungültige Anmeldedaten – bitte Benutzername und App-Passwort prüfen');
    }
    if (response.status === 404) {
      throw new Error('Server nicht gefunden – bitte URL prüfen');
    }
    // WebDAV success returns 207 Multi-Status
    if (!response.ok && response.status !== 207) {
      throw new Error(`Verbindung fehlgeschlagen: HTTP ${response.status}`);
    }

    return { displayName: this.username, server: this.serverUrl };
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
