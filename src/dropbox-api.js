/**
 * SmartScan Dropbox API Integration
 * Handles OAuth PKCE flow, token management, and file uploads
 */

import { CONFIG, getRedirectUri } from './config.js';
import { randomBytes, base64UrlEncode, sha256 } from './utils.js';

/**
 * Dropbox API client
 */
class DropboxAPI {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Initialize the API client
   * Loads tokens from storage and checks for OAuth callback
   */
  async init() {
    // Load stored tokens
    this.loadTokens();

    // Check for OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    if (error) {
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname);
      throw new Error(`OAuth error: ${error}`);
    }

    if (code) {
      // Verify CSRF state before exchanging the code
      const returnedState = urlParams.get('state');
      const expectedState = sessionStorage.getItem(CONFIG.storage.oauthState);
      sessionStorage.removeItem(CONFIG.storage.oauthState);
      if (!expectedState || returnedState !== expectedState) {
        window.history.replaceState({}, '', window.location.pathname);
        throw new Error('OAuth state mismatch — possible CSRF attack, please try again');
      }

      // Complete OAuth flow
      await this.exchangeCodeForTokens(code);
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname);
    }

    return this.isAuthenticated();
  }

  /**
   * Check if user is authenticated
   * @returns {boolean}
   */
  isAuthenticated() {
    return !!this.accessToken;
  }

  /**
   * Load tokens from sessionStorage.
   * Both access and refresh tokens are session-only to reduce exposure.
   * One-time migration: moves any existing refresh token out of localStorage.
   */
  loadTokens() {
    this.accessToken  = sessionStorage.getItem(CONFIG.storage.dropboxToken);
    this.refreshToken = sessionStorage.getItem(CONFIG.storage.dropboxRefreshToken);

    // Migrate refresh token from localStorage (one-time, for existing users)
    if (!this.refreshToken) {
      const legacy = localStorage.getItem(CONFIG.storage.dropboxRefreshToken);
      if (legacy) {
        this.refreshToken = legacy;
        sessionStorage.setItem(CONFIG.storage.dropboxRefreshToken, legacy);
        localStorage.removeItem(CONFIG.storage.dropboxRefreshToken);
      }
    }

    const expiry = sessionStorage.getItem(CONFIG.storage.dropboxTokenExpiry);
    this.tokenExpiry = expiry ? parseInt(expiry, 10) : null;
  }

  /**
   * Save tokens to sessionStorage (session-only, not persisted across browser sessions)
   */
  saveTokens() {
    if (this.accessToken) {
      sessionStorage.setItem(CONFIG.storage.dropboxToken, this.accessToken);
    }
    if (this.refreshToken) {
      sessionStorage.setItem(CONFIG.storage.dropboxRefreshToken, this.refreshToken);
    }
    if (this.tokenExpiry) {
      sessionStorage.setItem(CONFIG.storage.dropboxTokenExpiry, String(this.tokenExpiry));
    }
  }

  /**
   * Clear stored tokens (logout)
   */
  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    sessionStorage.removeItem(CONFIG.storage.dropboxToken);
    sessionStorage.removeItem(CONFIG.storage.dropboxRefreshToken);
    sessionStorage.removeItem(CONFIG.storage.dropboxTokenExpiry);
    sessionStorage.removeItem(CONFIG.storage.codeVerifier);
    localStorage.removeItem(CONFIG.storage.dropboxRefreshToken); // clean up any legacy entry
  }

  /**
   * Get the Dropbox Client ID.
   * Priority: localStorage override → config.js hardcoded value.
   * @returns {string|null}
   */
  getClientId() {
    // Allow app owner to set the key via Settings UI without touching code
    const stored = localStorage.getItem(CONFIG.storage.dropboxClientId);
    if (stored && stored.trim()) return stored.trim();

    const clientId = CONFIG.dropbox.clientId;
    if (!clientId || clientId === 'YOUR_DROPBOX_APP_KEY') return null;
    return clientId;
  }

  /**
   * Persist a Client ID entered via the Settings UI
   * @param {string} clientId
   */
  setClientId(clientId) {
    if (clientId && clientId.trim()) {
      localStorage.setItem(CONFIG.storage.dropboxClientId, clientId.trim());
    } else {
      localStorage.removeItem(CONFIG.storage.dropboxClientId);
    }
  }

  /**
   * Check if Dropbox is properly configured
   * @returns {boolean}
   */
  isConfigured() {
    return !!this.getClientId();
  }

  /**
   * Generate PKCE code verifier
   * @returns {string}
   */
  generateCodeVerifier() {
    const bytes = randomBytes(32);
    return base64UrlEncode(bytes);
  }

  /**
   * Generate PKCE code challenge from verifier
   * @param {string} verifier
   * @returns {Promise<string>}
   */
  async generateCodeChallenge(verifier) {
    const hash = await sha256(verifier);
    return base64UrlEncode(hash);
  }

  /**
   * Start OAuth authorization flow
   * Redirects to Dropbox authorization page
   */
  async authorize() {
    const clientId = this.getClientId();
    if (!clientId) {
      throw new Error('Dropbox Client ID nicht konfiguriert');
    }

    // Generate PKCE values
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);

    // Store verifier for later exchange
    sessionStorage.setItem(CONFIG.storage.codeVerifier, codeVerifier);

    // Generate CSRF state token and store alongside code verifier
    const state = crypto.randomUUID();
    sessionStorage.setItem(CONFIG.storage.oauthState, state);

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: getRedirectUri(),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      token_access_type: 'offline', // Request refresh token
      state: state
    });

    const authUrl = `${CONFIG.dropbox.authEndpoint}?${params.toString()}`;

    // Redirect to Dropbox
    window.location.href = authUrl;
  }

  /**
   * Exchange authorization code for tokens
   * @param {string} code - Authorization code from callback
   */
  async exchangeCodeForTokens(code) {
    const clientId = this.getClientId();
    const codeVerifier = sessionStorage.getItem(CONFIG.storage.codeVerifier);

    if (!clientId || !codeVerifier) {
      throw new Error('OAuth state missing');
    }

    const response = await fetch(CONFIG.dropbox.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: clientId,
        redirect_uri: getRedirectUri(),
        code_verifier: codeVerifier
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error_description || 'Token exchange failed');
    }

    const data = await response.json();

    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.tokenExpiry = data.expires_in ? Date.now() + (data.expires_in * 1000) : null;

    this.saveTokens();

    // Clear verifier
    sessionStorage.removeItem(CONFIG.storage.codeVerifier);
  }

  /**
   * Refresh the access token
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const clientId = this.getClientId();
    if (!clientId) {
      throw new Error('Dropbox Client ID nicht konfiguriert');
    }

    const response = await fetch(CONFIG.dropbox.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: clientId
      })
    });

    if (!response.ok) {
      // Refresh token invalid, need to re-authorize
      this.clearTokens();
      throw new Error('Session expired, please reconnect to Dropbox');
    }

    const data = await response.json();

    this.accessToken = data.access_token;
    if (data.refresh_token) {
      this.refreshToken = data.refresh_token;
    }
    this.tokenExpiry = data.expires_in ? Date.now() + (data.expires_in * 1000) : null;

    this.saveTokens();
  }

  /**
   * Make an authenticated API request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>}
   */
  async apiRequest(endpoint, options = {}, _retryCount = 0) {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    // Check if token needs refresh
    if (this.tokenExpiry && Date.now() > this.tokenExpiry - 60000) {
      await this.refreshAccessToken();
    }

    const url = endpoint.startsWith('https://') ? endpoint : `${CONFIG.dropbox.apiEndpoint}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        ...options.headers
      }
    });

    // Handle token expiry — retry once after refresh
    if (response.status === 401) {
      if (_retryCount >= 1) {
        throw new Error('Authentication failed after token refresh — please reconnect to Dropbox');
      }
      await this.refreshAccessToken();
      return this.apiRequest(endpoint, options, _retryCount + 1);
    }

    return response;
  }

  /**
   * Create a folder and all parent folders (if they don't exist)
   * @param {string} path - Folder path (e.g., '/SmartScan/Finanzen/Gehaltsabrechnung')
   */
  async createFolder(path) {
    // Split path into parts and create each level
    const parts = path.split('/').filter(p => p.length > 0);
    let currentPath = '';

    for (const part of parts) {
      currentPath += '/' + part;
      await this.createSingleFolder(currentPath);
    }
  }

  /**
   * Create a single folder (ignores if already exists)
   * @param {string} path - Folder path
   */
  async createSingleFolder(path) {
    const response = await this.apiRequest('/files/create_folder_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        path: path,
        autorename: false
      })
    });

    // 409 Conflict = folder already exists, that's fine
    if (response.status === 409) {
      return;
    }

    if (!response.ok) {
      const responseText = await response.text();
      // Also check response body for conflict (backup check)
      if (responseText.includes('conflict')) {
        return;
      }
      throw new Error(`Folder creation failed: ${responseText.substring(0, 200)}`);
    }
  }

  /**
   * Encode object for Dropbox-API-Arg header (escape non-ASCII characters)
   * @param {Object} arg - Object to encode
   * @returns {string} Encoded JSON string safe for HTTP headers
   */
  encodeDropboxArg(arg) {
    const jsonStr = JSON.stringify(arg);
    // Escape non-ASCII characters for HTTP header compatibility
    return jsonStr.replace(/[\u007f-\uffff]/g, char => {
      return '\\u' + ('0000' + char.charCodeAt(0).toString(16)).slice(-4);
    });
  }

  /**
   * Upload a file to Dropbox
   * @param {Blob|ArrayBuffer} content - File content
   * @param {string} path - Destination path (including filename)
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} File metadata
   */
  async uploadFile(content, path, options = {}) {
    if (!this.accessToken) {
      throw new Error('Nicht mit Dropbox verbunden');
    }

    if (!content) {
      throw new Error('Kein Inhalt zum Hochladen');
    }

    // Ensure parent folder exists
    const folderPath = path.substring(0, path.lastIndexOf('/'));
    if (folderPath) {
      await this.createFolder(folderPath);
    }

    const dropboxArg = {
      path: path,
      mode: options.overwrite ? 'overwrite' : 'add',
      autorename: true,
      mute: false
    };

    const response = await fetch(`${CONFIG.dropbox.contentEndpoint}/files/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': this.encodeDropboxArg(dropboxArg)
      },
      body: content
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Dropbox upload error:', response.status, errorText);

      let errorMessage = errorText || `Upload failed: ${response.status}`;
      try {
        const error = JSON.parse(errorText);
        errorMessage = error.error_summary || error.error?.message || errorMessage;
      } catch (e) {
        // Keep text error
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * Get account info
   * @returns {Promise<Object>}
   */
  async getAccountInfo() {
    const response = await this.apiRequest('/users/get_current_account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: 'null'
    });

    if (!response.ok) {
      throw new Error('Failed to get account info');
    }

    return response.json();
  }
}

// Export singleton instance
export const dropboxAPI = new DropboxAPI();
