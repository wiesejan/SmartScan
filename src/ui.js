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
  isAuthenticated: false,        // Dropbox connected
  isNextcloudConnected: false,   // Nextcloud connected
  currentImage: null, // { blob, base64, dataUrl }
  currentMetadata: null, // { category, date, name, sender, amount, confidence }
  processingStatus: 'idle', // 'idle', 'capturing', 'analyzing', 'uploading'
  error: null,
  savedDocument: null, // { filename, folder, category }
  // Multi-page state
  isMultiPageMode: false,
  scannedPages: [] // Array of { imageData: { blob, base64, dataUrl }, thumbnail: string }
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
    multipage: document.getElementById('screen-multipage'),
    processing: document.getElementById('screen-processing'),
    edit: document.getElementById('screen-edit'),
    success: document.getElementById('screen-success')
  };

  // Cache commonly used elements
  elements = {
    // Home
    authStatus: document.getElementById('auth-status'),
    btnStartScan: document.getElementById('btn-start-scan'),
    btnStartMultipage: document.getElementById('btn-start-multipage'),

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

    // Multipage
    multipageCounter: document.getElementById('multipage-counter'),
    multipagePages: document.getElementById('multipage-pages'),
    multipageEmpty: document.getElementById('multipage-empty'),
    btnMultipageCancel: document.getElementById('btn-multipage-cancel'),
    btnMultipageAdd: document.getElementById('btn-multipage-add'),
    btnMultipageFinish: document.getElementById('btn-multipage-finish'),

    // Processing
    processingPreview: document.getElementById('processing-preview'),
    processingStatus: document.getElementById('processing-status'),
    processingSubstatus: document.getElementById('processing-substatus'),

    // Edit
    editPreview: document.getElementById('edit-preview'),
    editPreviewContainer: document.getElementById('edit-preview-container'),
    editMultipagePreview: document.getElementById('edit-multipage-preview'),
    editMultipageThumbnails: document.getElementById('edit-multipage-thumbnails'),
    editMultipageLabel: document.getElementById('edit-multipage-label'),
    editForm: document.getElementById('edit-form'),
    editCategory: document.getElementById('edit-category'),
    editDate: document.getElementById('edit-date'),
    editSender: document.getElementById('edit-sender'),
    editName: document.getElementById('edit-name'),
    editAmount: document.getElementById('edit-amount'),
    editAmountGroup: document.getElementById('edit-amount-group'),
    editNotes: document.getElementById('edit-notes'),
    filenameInput: document.getElementById('edit-filename'),
    filenameHint: document.getElementById('filename-hint'),
    btnFilenameReset: document.getElementById('btn-filename-reset'),
    btnEditBack: document.getElementById('btn-edit-back'),
    btnSave: document.getElementById('btn-save'),

    // Success
    successFilename: document.getElementById('success-filename'),
    successFolder: document.getElementById('success-folder'),
    successCategory: document.getElementById('success-category'),
    successPagesContainer: document.getElementById('success-pages-container'),
    successPages: document.getElementById('success-pages'),
    btnScanAnother: document.getElementById('btn-scan-another'),
    btnGoHome: document.getElementById('btn-go-home'),

    // Settings
    settingsBtn: document.getElementById('settings-btn'),
    settingsPanel: document.getElementById('settings-panel'),
    settingsOverlay: document.getElementById('settings-overlay'),
    settingsClose: document.getElementById('settings-close'),
    btnDropboxConnect: document.getElementById('btn-dropbox-connect'),
    btnDropboxDisconnect: document.getElementById('btn-dropbox-disconnect'),
    btnClearData: document.getElementById('btn-clear-data'),

    // Dropbox connection UI
    homeConnectPrompt: document.getElementById('home-connect-prompt'),
    btnHomeConnect: document.getElementById('btn-home-connect'),
    dropboxDisconnected: document.getElementById('dropbox-disconnected'),
    dropboxConnected: document.getElementById('dropbox-connected'),
    dropboxAccountName: document.getElementById('dropbox-account-name'),
    dropboxAppKeySection: document.getElementById('dropbox-appkey-section'),
    dropboxClientIdInput: document.getElementById('dropbox-client-id-input'),
    btnDropboxSaveKey: document.getElementById('btn-dropbox-save-key'),

    // Nextcloud connection UI
    nextcloudDisconnected: document.getElementById('nextcloud-disconnected'),
    nextcloudConnected: document.getElementById('nextcloud-connected'),
    nextcloudAccountName: document.getElementById('nextcloud-account-name'),
    nextcloudUrl: document.getElementById('nextcloud-url'),
    nextcloudUsername: document.getElementById('nextcloud-username'),
    nextcloudPassword: document.getElementById('nextcloud-password'),
    btnNextcloudTest: document.getElementById('btn-nextcloud-test'),
    btnNextcloudSave: document.getElementById('btn-nextcloud-save'),
    btnNextcloudDisconnect: document.getElementById('btn-nextcloud-disconnect'),

    // Storage target selector
    storageTargetSection: document.getElementById('storage-target-section'),
    storageTargetSelect: document.getElementById('storage-target-select'),

    // Success screen
    successMessage: document.getElementById('success-message'),
    successStorage: document.getElementById('success-storage'),

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
 * Update the home screen auth status and Dropbox settings panel.
 * @param {boolean} isDropboxAuth
 * @param {string|null} accountName - Dropbox account name
 * @param {boolean} isDropboxConfigured - Whether a Client ID is available
 */
export function updateAuthStatus(isDropboxAuth, accountName = null, isDropboxConfigured = true) {
  updateState({ isAuthenticated: isDropboxAuth });

  // Show/hide the App Key input depending on whether Dropbox is configured
  if (elements.dropboxAppKeySection) {
    elements.dropboxAppKeySection.classList.toggle('hidden', isDropboxConfigured);
  }

  // Update settings panel dropbox status
  if (elements.dropboxDisconnected) {
    elements.dropboxDisconnected.classList.toggle('hidden', isDropboxAuth);
  }
  if (elements.dropboxConnected) {
    elements.dropboxConnected.classList.toggle('hidden', !isDropboxAuth);
  }
  if (elements.dropboxAccountName && accountName) {
    elements.dropboxAccountName.textContent = accountName;
  }

  // Refresh the home screen ready status
  refreshHomeStatus();
}

/**
 * Update the Nextcloud settings panel.
 * @param {boolean} isConnected
 * @param {string|null} accountName
 */
export function updateNextcloudStatus(isConnected, accountName = null) {
  if (elements.nextcloudDisconnected) {
    elements.nextcloudDisconnected.classList.toggle('hidden', isConnected);
  }
  if (elements.nextcloudConnected) {
    elements.nextcloudConnected.classList.toggle('hidden', !isConnected);
  }
  if (elements.nextcloudAccountName && accountName) {
    elements.nextcloudAccountName.textContent = accountName;
  }

  // Refresh the home screen ready status
  refreshHomeStatus();
}

/**
 * Show or hide the storage target selector based on how many storages are connected.
 * @param {boolean} dropboxConnected
 * @param {boolean} nextcloudConnected
 * @param {string} currentTarget - 'dropbox' | 'nextcloud' | 'both'
 */
export function updateStorageTargetUI(dropboxConnected, nextcloudConnected, currentTarget) {
  const section = elements.storageTargetSection;
  if (!section) return;

  const bothAvailable = dropboxConnected && nextcloudConnected;
  section.style.display = bothAvailable ? '' : 'none';

  if (elements.storageTargetSelect) {
    elements.storageTargetSelect.value = currentTarget;
  }
}

/**
 * Refresh home screen connection prompt and status text.
 * Called whenever Dropbox or Nextcloud connection state changes.
 */
export function refreshHomeStatus() {
  const isDropbox   = state.isAuthenticated;
  const isNextcloud = state.isNextcloudConnected || false;
  const anyConnected = isDropbox || isNextcloud;

  if (elements.homeConnectPrompt) {
    elements.homeConnectPrompt.classList.toggle('hidden', anyConnected);
  }

  const statusEl = elements.authStatus;
  if (!statusEl) return;

  if (anyConnected) {
    const parts = [];
    if (isDropbox)   parts.push('Dropbox');
    if (isNextcloud) parts.push('Nextcloud');
    statusEl.textContent = `Bereit zum Scannen (${parts.join(' & ')})`;
    statusEl.style.color = 'var(--color-success)';
  } else {
    statusEl.textContent = 'Kein Cloud-Speicher verbunden';
    statusEl.style.color = '';
  }
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

  alternatives.forEach(({ category, score }) => {
    const catConfig = getCategoryById(category);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'category-alternatives__item';
    btn.textContent = catConfig?.label || category;
    btn.addEventListener('click', () => {
      elements.editCategory.value = category;
      elements.categoryAlternatives.classList.add('hidden');
    });
    elements.alternativesList.appendChild(btn);
  });
}

/**
 * Set current image and update previews
 * @param {Object} imageData - { blob, base64, dataUrl }
 */
export function setCurrentImage(imageData) {
  updateState({ currentImage: imageData });

  // Update preview images
  if (imageData?.dataUrl) {
    if (elements.processingPreview) {
      elements.processingPreview.src = imageData.dataUrl;
    }
    if (elements.editPreview) {
      elements.editPreview.src = imageData.dataUrl;
    }
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
    elements.editSender.value = metadata.sender || '';
    elements.editName.value = metadata.name || '';
    elements.editAmount.value = metadata.amount || '';
    elements.editNotes.value = '';

    // Update filename preview
    updateFilenamePreview();
  }
}

/**
 * Get form data from edit screen
 * @returns {Object}
 */
export function getFormData() {
  return {
    category: elements.editCategory?.value || '',
    date: elements.editDate?.value || '',
    sender: elements.editSender?.value?.trim() || '',
    name: elements.editName?.value || '',
    amount: elements.editAmount?.value?.trim() || '',
    notes: elements.editNotes?.value || ''
  };
}

// Track if filename was manually edited
let filenameManuallyEdited = false;

/**
 * Sanitize a string for use in filename (remove invalid characters)
 * @param {string} str - Input string
 * @returns {string} Sanitized string
 */
function sanitizeForFilename(str) {
  return str
    .replace(/[<>:"/\\|?*]/g, '-')  // Replace invalid chars
    .replace(/\s+/g, '.')           // Replace spaces with dots
    .replace(/\.{2,}/g, '.')        // Collapse multiple dots
    .replace(/^\.+|\.+$/g, '');     // Trim dots at start/end
}

/**
 * Generate auto filename based on form values
 * Format: YYYY-MM-DD_Absender_Kategorie_weitere.Attribute.pdf
 * @returns {string} Generated filename
 */
export function generateAutoFilename() {
  const category = elements.editCategory?.value || '';
  const date = elements.editDate?.value || '';
  const sender = elements.editSender?.value?.trim() || '';
  const name = elements.editName?.value?.trim() || '';
  const amount = elements.editAmount?.value?.trim() || '';

  if (!date || !category) {
    return '';
  }

  // Date is already in YYYY-MM-DD format from input[type="date"]
  const dateFormatted = date;

  // Get category label from config
  const categoryConfig = getCategoryById(category);
  const categoryLabel = categoryConfig?.label || 'Dokument';

  // Build filename parts: YYYY-MM-DD_Absender_Kategorie_weitere.Attribute
  let parts = [dateFormatted];

  // Add sender/institution if available
  if (sender) {
    parts.push(sanitizeForFilename(sender));
  }

  // Add category
  parts.push(sanitizeForFilename(categoryLabel));

  // Add additional attributes (description, amount)
  let attributes = [];
  if (name) {
    attributes.push(sanitizeForFilename(name));
  }
  if (amount && (category === 'invoice' || category === 'receipt')) {
    attributes.push(amount.replace(/[€\s]/g, '').replace(',', '-') + 'EUR');
  }

  if (attributes.length > 0) {
    parts.push(attributes.join('.'));
  }

  return parts.join('_') + '.pdf';
}

/**
 * Update filename input based on current form values
 * Only updates if not manually edited
 */
export function updateFilenamePreview() {
  if (!elements.filenameInput) return;

  const autoFilename = generateAutoFilename();

  // Only update if not manually edited
  if (!filenameManuallyEdited) {
    elements.filenameInput.value = autoFilename;
    elements.filenameInput.classList.add('auto-generated');
    if (elements.filenameHint) {
      elements.filenameHint.textContent = 'Automatisch generiert basierend auf Kategorie und Datum';
    }
  }
}

/**
 * Mark filename as manually edited
 */
export function setFilenameManuallyEdited(edited) {
  filenameManuallyEdited = edited;
  if (elements.filenameInput) {
    elements.filenameInput.classList.toggle('auto-generated', !edited);
  }
  if (elements.filenameHint) {
    elements.filenameHint.textContent = edited
      ? 'Manuell angepasst'
      : 'Automatisch generiert basierend auf Kategorie und Datum';
  }
}

/**
 * Reset filename to auto-generated
 */
export function resetFilenameToAuto() {
  filenameManuallyEdited = false;
  updateFilenamePreview();
}

/**
 * Get the current filename (manual or auto)
 * @returns {string} Filename
 */
export function getFilename() {
  if (elements.filenameInput?.value) {
    let filename = elements.filenameInput.value.trim();
    // Ensure .pdf extension
    if (!filename.toLowerCase().endsWith('.pdf')) {
      filename += '.pdf';
    }
    return filename;
  }
  return generateAutoFilename();
}

/**
 * Show success screen with document details
 * @param {Object} details - { filename, folder, category, storageLabel }
 */
export function showSuccess(details) {
  updateState({ savedDocument: details });

  elements.successFilename.textContent = details.filename;
  elements.successFolder.textContent = details.folder;

  const category = getCategoryById(details.category);
  elements.successCategory.textContent = category?.label || details.category;

  if (elements.successStorage) {
    elements.successStorage.textContent = details.storageLabel || 'Cloud';
  }

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

  // Insert static SVG icon via innerHTML (safe — no user data)
  const iconContainer = document.createElement('span');
  iconContainer.innerHTML = icons[type] || icons.info;
  toast.appendChild(iconContainer.firstElementChild);

  // Message via textContent to prevent XSS
  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast__message';
  msgSpan.textContent = message;
  toast.appendChild(msgSpan);

  // Close button (static SVG, safe)
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast__close';
  closeBtn.setAttribute('aria-label', 'Schließen');
  closeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  closeBtn.addEventListener('click', () => removeToast(toast));

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
    savedDocument: null,
    isMultiPageMode: false,
    scannedPages: []
  });

  // Clear form
  elements.editForm.reset();

  // Reset filename to auto-generated mode
  filenameManuallyEdited = false;
  if (elements.filenameInput) {
    elements.filenameInput.value = '';
    elements.filenameInput.classList.add('auto-generated');
  }

  // Clear multipage UI
  clearMultipageUI();
}

/**
 * Set multi-page mode
 * @param {boolean} enabled
 */
export function setMultiPageMode(enabled) {
  updateState({ isMultiPageMode: enabled, scannedPages: [] });
  clearMultipageUI();
}

/**
 * Add a page to multi-page document
 * @param {Object} imageData - { blob, base64, dataUrl }
 */
export function addScannedPage(imageData) {
  const pages = [...state.scannedPages, { imageData }];
  updateState({ scannedPages: pages });
  updateMultipageUI();
}

/**
 * Remove a page from multi-page document
 * @param {number} index
 */
export function removeScannedPage(index) {
  const pages = state.scannedPages.filter((_, i) => i !== index);
  updateState({ scannedPages: pages });
  updateMultipageUI();
}

/**
 * Clear the multipage UI
 */
function clearMultipageUI() {
  if (elements.multipagePages) {
    // Remove all page items except the empty message
    const pageItems = elements.multipagePages.querySelectorAll('.multipage__page');
    pageItems.forEach(item => item.remove());
  }
  if (elements.multipageEmpty) {
    elements.multipageEmpty.classList.remove('hidden');
  }
  if (elements.multipageCounter) {
    elements.multipageCounter.textContent = '0 Seiten';
  }
  if (elements.btnMultipageFinish) {
    elements.btnMultipageFinish.disabled = true;
  }
  // Reset edit preview
  if (elements.editMultipagePreview) {
    elements.editMultipagePreview.classList.add('hidden');
  }
  if (elements.editPreview) {
    elements.editPreview.classList.remove('hidden');
  }
}

/**
 * Update the multipage UI with current pages
 */
export function updateMultipageUI() {
  const pages = state.scannedPages;
  const count = pages.length;

  // Update counter
  elements.multipageCounter.textContent = `${count} ${count === 1 ? 'Seite' : 'Seiten'}`;

  // Show/hide empty message
  elements.multipageEmpty.classList.toggle('hidden', count > 0);

  // Enable/disable finish button
  elements.btnMultipageFinish.disabled = count === 0;

  // Remove existing page items
  const existingItems = elements.multipagePages.querySelectorAll('.multipage__page');
  existingItems.forEach(item => item.remove());

  // Add page thumbnails — built via DOM methods to prevent XSS
  pages.forEach((page, index) => {
    const pageEl = document.createElement('div');
    pageEl.className = 'multipage__page';

    const img = document.createElement('img');
    img.className = 'multipage__page-img';
    img.src = page.imageData.dataUrl;
    img.alt = `Seite ${index + 1}`;

    const num = document.createElement('span');
    num.className = 'multipage__page-number';
    num.textContent = String(index + 1);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'multipage__page-remove';
    removeBtn.setAttribute('aria-label', 'Seite entfernen');
    removeBtn.dataset.index = String(index);
    removeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

    pageEl.appendChild(img);
    pageEl.appendChild(num);
    pageEl.appendChild(removeBtn);
    elements.multipagePages.appendChild(pageEl);
  });
}

/**
 * Update edit preview for multi-page document
 */
export function updateEditPreviewMultipage() {
  const pages = state.scannedPages;

  if (pages.length > 1) {
    // Show multi-page preview
    elements.editPreview.classList.add('hidden');
    elements.editMultipagePreview.classList.remove('hidden');

    // Update label
    elements.editMultipageLabel.textContent = `${pages.length} Seiten`;

    // Clear and add thumbnails
    elements.editMultipageThumbnails.innerHTML = '';
    pages.forEach((page, index) => {
      const thumb = document.createElement('img');
      thumb.className = 'edit__multipage-thumb';
      thumb.src = page.imageData.dataUrl;
      thumb.alt = `Seite ${index + 1}`;
      elements.editMultipageThumbnails.appendChild(thumb);
    });
  } else if (pages.length === 1) {
    // Single page in multi-page mode
    elements.editPreview.classList.remove('hidden');
    elements.editMultipagePreview.classList.add('hidden');
    elements.editPreview.src = pages[0].imageData.dataUrl;
  }
}

/**
 * Show success with page count
 * @param {Object} details - { filename, folder, category, pageCount }
 */
export function showSuccessMultipage(details) {
  updateState({ savedDocument: details });

  elements.successFilename.textContent = details.filename;
  elements.successFolder.textContent = details.folder;

  const category = getCategoryById(details.category);
  elements.successCategory.textContent = category?.label || details.category;

  if (elements.successStorage) {
    elements.successStorage.textContent = details.storageLabel || 'Cloud';
  }

  // Show page count if multi-page
  if (details.pageCount && details.pageCount > 1) {
    elements.successPagesContainer.classList.remove('hidden');
    elements.successPages.textContent = details.pageCount;
  } else {
    elements.successPagesContainer.classList.add('hidden');
  }

  showScreen('success');
}
