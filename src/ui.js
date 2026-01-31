/**
 * SmartScan UI Module
 * Screen management, state updates, and user interface logic
 */

import { CONFIG, getCategoryById } from './config.js';

/**
 * Application state
 */
export const state = {
  screen: 'home',
  isAuthenticated: false,
  isClaudeConfigured: false,
  currentImage: null, // { blob, base64, dataUrl }
  currentMetadata: null, // { category, date, name, sender, amount, confidence }
  processingStatus: 'idle', // 'idle', 'capturing', 'analyzing', 'uploading'
  error: null,
  savedDocument: null // { filename, folder, category }
};

/**
 * State change listeners
 */
const listeners = new Set();

/**
 * Subscribe to state changes
 * @param {Function} listener
 * @returns {Function} Unsubscribe function
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Update state and notify listeners
 * @param {Object} updates
 */
export function updateState(updates) {
  Object.assign(state, updates);
  listeners.forEach(listener => listener(state));
}

/**
 * Screen elements cache
 */
let screens = {};
let elements = {};

/**
 * Initialize UI
 */
export function initUI() {
  // Cache screen elements
  screens = {
    home: document.getElementById('screen-home'),
    camera: document.getElementById('screen-camera'),
    processing: document.getElementById('screen-processing'),
    edit: document.getElementById('screen-edit'),
    success: document.getElementById('screen-success')
  };

  // Cache commonly used elements
  elements = {
    // Home
    authStatus: document.getElementById('auth-status'),
    btnStartScan: document.getElementById('btn-start-scan'),

    // Camera
    cameraVideo: document.getElementById('camera-video'),
    cameraCanvas: document.getElementById('camera-canvas'),
    btnCapture: document.getElementById('btn-capture'),
    btnSwitchCamera: document.getElementById('btn-switch-camera'),
    btnCameraBack: document.getElementById('btn-camera-back'),
    fileUpload: document.getElementById('file-upload'),

    // Processing
    processingPreview: document.getElementById('processing-preview'),
    processingStatus: document.getElementById('processing-status'),
    processingSubstatus: document.getElementById('processing-substatus'),

    // Edit
    editPreview: document.getElementById('edit-preview'),
    editForm: document.getElementById('edit-form'),
    editCategory: document.getElementById('edit-category'),
    editDate: document.getElementById('edit-date'),
    editName: document.getElementById('edit-name'),
    editNotes: document.getElementById('edit-notes'),
    btnEditBack: document.getElementById('btn-edit-back'),
    btnSave: document.getElementById('btn-save'),

    // Success
    successFilename: document.getElementById('success-filename'),
    successFolder: document.getElementById('success-folder'),
    successCategory: document.getElementById('success-category'),
    btnScanAnother: document.getElementById('btn-scan-another'),
    btnGoHome: document.getElementById('btn-go-home'),

    // Settings
    settingsBtn: document.getElementById('settings-btn'),
    settingsPanel: document.getElementById('settings-panel'),
    settingsOverlay: document.getElementById('settings-overlay'),
    settingsClose: document.getElementById('settings-close'),
    dropboxClientId: document.getElementById('settings-dropbox-client-id'),
    claudeApiKey: document.getElementById('settings-claude-key'),
    btnDropboxConnect: document.getElementById('btn-dropbox-connect'),
    btnDropboxDisconnect: document.getElementById('btn-dropbox-disconnect'),
    btnClaudeSave: document.getElementById('btn-claude-save'),
    btnClearData: document.getElementById('btn-clear-data'),

    // Toast
    toastContainer: document.getElementById('toast-container')
  };
}

/**
 * Show a specific screen
 * @param {string} screenName
 */
export function showScreen(screenName) {
  // Hide all screens
  Object.values(screens).forEach(screen => {
    screen.classList.remove('active');
  });

  // Show target screen
  if (screens[screenName]) {
    screens[screenName].classList.add('active');
    updateState({ screen: screenName });
  }
}

/**
 * Update the home screen auth status
 * @param {boolean} isDropboxAuth
 * @param {boolean} isClaudeConfigured
 */
export function updateAuthStatus(isDropboxAuth, isClaudeConfigured) {
  updateState({
    isAuthenticated: isDropboxAuth,
    isClaudeConfigured
  });

  const statusEl = elements.authStatus;
  const messages = [];

  if (!isDropboxAuth) {
    messages.push('Dropbox nicht verbunden');
  }
  if (!isClaudeConfigured) {
    messages.push('Claude API nicht konfiguriert');
  }

  if (messages.length === 0) {
    statusEl.textContent = 'Bereit zum Scannen';
    statusEl.style.color = 'var(--color-success)';
  } else {
    statusEl.textContent = messages.join(' • ');
    statusEl.style.color = '';
  }

  // Update connect/disconnect buttons
  elements.btnDropboxConnect.classList.toggle('hidden', isDropboxAuth);
  elements.btnDropboxDisconnect.classList.toggle('hidden', !isDropboxAuth);
}

/**
 * Update processing screen status
 * @param {string} status - Main status message
 * @param {string} substatus - Secondary status message
 */
export function updateProcessingStatus(status, substatus = '') {
  elements.processingStatus.textContent = status;
  elements.processingSubstatus.textContent = substatus;
}

/**
 * Set current image and update previews
 * @param {Object} imageData - { blob, base64, dataUrl }
 */
export function setCurrentImage(imageData) {
  updateState({ currentImage: imageData });

  // Update preview images
  if (imageData?.dataUrl) {
    elements.processingPreview.src = imageData.dataUrl;
    elements.editPreview.src = imageData.dataUrl;
  }
}

/**
 * Set document metadata and populate edit form
 * @param {Object} metadata
 */
export function setMetadata(metadata) {
  updateState({ currentMetadata: metadata });

  if (metadata) {
    // Populate form
    elements.editCategory.value = metadata.category || '';
    elements.editDate.value = metadata.date || new Date().toISOString().split('T')[0];
    elements.editName.value = metadata.name || '';
    elements.editNotes.value = '';
  }
}

/**
 * Get form data from edit screen
 * @returns {Object}
 */
export function getFormData() {
  return {
    category: elements.editCategory.value,
    date: elements.editDate.value,
    name: elements.editName.value,
    notes: elements.editNotes.value
  };
}

/**
 * Show success screen with document details
 * @param {Object} details - { filename, folder, category }
 */
export function showSuccess(details) {
  updateState({ savedDocument: details });

  elements.successFilename.textContent = details.filename;
  elements.successFolder.textContent = details.folder;

  const category = getCategoryById(details.category);
  elements.successCategory.textContent = category?.label || details.category;

  showScreen('success');
}

/**
 * Open settings panel
 */
export function openSettings() {
  elements.settingsPanel.classList.add('open');
  elements.settingsOverlay.classList.add('open');
}

/**
 * Close settings panel
 */
export function closeSettings() {
  elements.settingsPanel.classList.remove('open');
  elements.settingsOverlay.classList.remove('open');
}

/**
 * Load settings values into form
 * @param {Object} settings - { dropboxClientId, claudeApiKey }
 */
export function loadSettingsForm(settings) {
  if (settings.dropboxClientId) {
    elements.dropboxClientId.value = settings.dropboxClientId;
  }
  if (settings.claudeApiKey) {
    // Show masked value
    elements.claudeApiKey.value = settings.claudeApiKey;
  }
}

/**
 * Get settings form values
 * @returns {Object}
 */
export function getSettingsFormData() {
  return {
    dropboxClientId: elements.dropboxClientId.value.trim(),
    claudeApiKey: elements.claudeApiKey.value.trim()
  };
}

/**
 * Show a toast notification
 * @param {string} message
 * @param {string} type - 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duration in ms (0 for persistent)
 */
export function showToast(message, type = 'info', duration = 4000) {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  const icons = {
    success: '<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  toast.innerHTML = `
    ${icons[type] || icons.info}
    <span class="toast__message">${message}</span>
    <button type="button" class="toast__close" aria-label="Schließen">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `;

  // Close button handler
  toast.querySelector('.toast__close').addEventListener('click', () => {
    removeToast(toast);
  });

  elements.toastContainer.appendChild(toast);

  // Auto-remove after duration
  if (duration > 0) {
    setTimeout(() => removeToast(toast), duration);
  }

  return toast;
}

/**
 * Remove a toast notification
 * @param {HTMLElement} toast
 */
function removeToast(toast) {
  toast.style.animation = 'slideUp 0.25s ease reverse';
  setTimeout(() => toast.remove(), 250);
}

/**
 * Enable/disable save button
 * @param {boolean} enabled
 */
export function setSaveButtonEnabled(enabled) {
  elements.btnSave.disabled = !enabled;
}

/**
 * Get UI elements (for event binding)
 * @returns {Object}
 */
export function getElements() {
  return elements;
}

/**
 * Reset state for new scan
 */
export function resetForNewScan() {
  updateState({
    currentImage: null,
    currentMetadata: null,
    processingStatus: 'idle',
    error: null,
    savedDocument: null
  });

  // Clear form
  elements.editForm.reset();
}
