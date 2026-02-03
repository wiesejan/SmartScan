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
    crop: document.getElementById('screen-crop'),
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
    cameraGuide: document.getElementById('camera-guide'),
    cameraStatus: document.getElementById('camera-status'),
    btnCapture: document.getElementById('btn-capture'),
    btnSwitchCamera: document.getElementById('btn-switch-camera'),
    btnCameraBack: document.getElementById('btn-camera-back'),
    fileUpload: document.getElementById('file-upload'),

    // Crop
    cropCanvas: document.getElementById('crop-canvas'),
    cropOverlay: document.getElementById('crop-overlay'),
    cropPolygon: document.getElementById('crop-polygon'),
    cropHandles: {
      tl: document.getElementById('handle-tl'),
      tr: document.getElementById('handle-tr'),
      br: document.getElementById('handle-br'),
      bl: document.getElementById('handle-bl')
    },
    cropStatus: document.getElementById('crop-status'),
    btnCropBack: document.getElementById('btn-crop-back'),
    btnCropApply: document.getElementById('btn-crop-apply'),

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
    btnDropboxConnect: document.getElementById('btn-dropbox-connect'),
    btnDropboxDisconnect: document.getElementById('btn-dropbox-disconnect'),
    btnPreloadModels: document.getElementById('btn-preload-models'),
    modelsStatus: document.getElementById('models-status'),
    btnClearData: document.getElementById('btn-clear-data'),

    // Classification info
    classificationInfo: document.getElementById('classification-info'),
    classificationConfidence: document.getElementById('classification-confidence'),
    classificationBar: document.getElementById('classification-bar'),
    classificationHint: document.getElementById('classification-hint'),
    categoryAlternatives: document.getElementById('category-alternatives'),
    alternativesList: document.getElementById('alternatives-list'),

    // Processing progress
    processingProgress: document.getElementById('processing-progress'),
    processingProgressBar: document.getElementById('processing-progress-bar'),

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
 * @param {boolean} modelsReady - Whether OCR/classifier models are loaded
 */
export function updateAuthStatus(isDropboxAuth, modelsReady = true) {
  updateState({
    isAuthenticated: isDropboxAuth,
    isClaudeConfigured: true // No longer needed, always true for local processing
  });

  const statusEl = elements.authStatus;
  const messages = [];

  if (!isDropboxAuth) {
    messages.push('Dropbox nicht verbunden');
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
 * Update processing progress bar
 * @param {number} percent - Progress 0-100
 * @param {boolean} show - Whether to show the progress bar
 */
export function updateProcessingProgress(percent, show = true) {
  if (show) {
    elements.processingProgress.classList.remove('hidden');
    elements.processingProgressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  } else {
    elements.processingProgress.classList.add('hidden');
  }
}

/**
 * Update classification confidence display
 * @param {number} confidence - Confidence 0-1
 */
export function updateClassificationConfidence(confidence) {
  const percent = Math.round(confidence * 100);
  elements.classificationConfidence.textContent = `${percent}%`;
  elements.classificationBar.style.width = `${percent}%`;

  // Update styling based on confidence level
  const info = elements.classificationInfo;
  info.classList.remove('classification-info--high', 'classification-info--medium', 'classification-info--low');

  if (confidence >= 0.7) {
    info.classList.add('classification-info--high');
    elements.classificationHint.textContent = 'Hohe Sicherheit - Kategorie automatisch erkannt';
  } else if (confidence >= 0.4) {
    info.classList.add('classification-info--medium');
    elements.classificationHint.textContent = 'Bitte Kategorie überprüfen';
  } else {
    info.classList.add('classification-info--low');
    elements.classificationHint.textContent = 'Niedrige Sicherheit - bitte manuell korrigieren';
  }
}

/**
 * Show alternative category suggestions
 * @param {Array} alternatives - Array of { category, score } objects
 */
export function showCategoryAlternatives(alternatives) {
  if (!alternatives || alternatives.length === 0) {
    elements.categoryAlternatives.classList.add('hidden');
    return;
  }

  elements.categoryAlternatives.classList.remove('hidden');
  elements.alternativesList.innerHTML = '';

  const categoryLabels = {
    invoice: 'Rechnung',
    receipt: 'Beleg',
    contract: 'Vertrag',
    letter: 'Brief',
    tax: 'Steuer',
    insurance: 'Versicherung',
    medical: 'Medizinisch',
    bank: 'Bank',
    warranty: 'Garantie',
    other: 'Sonstiges'
  };

  alternatives.forEach(({ category, score }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'category-alternatives__item';
    btn.textContent = categoryLabels[category] || category;
    btn.addEventListener('click', () => {
      elements.editCategory.value = category;
      elements.categoryAlternatives.classList.add('hidden');
    });
    elements.alternativesList.appendChild(btn);
  });
}

/**
 * Update models status in settings
 * @param {string} status - Status message
 */
export function updateModelsStatus(status) {
  if (elements.modelsStatus) {
    elements.modelsStatus.textContent = status;
  }
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
 * @param {Object} settings - { dropboxClientId }
 */
export function loadSettingsForm(settings) {
  if (settings.dropboxClientId) {
    elements.dropboxClientId.value = settings.dropboxClientId;
  }
}

/**
 * Get settings form values
 * @returns {Object}
 */
export function getSettingsFormData() {
  return {
    dropboxClientId: elements.dropboxClientId.value.trim()
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
