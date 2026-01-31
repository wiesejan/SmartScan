/**
 * SmartScan Main Application
 * Orchestrates all modules and handles the document workflow
 */

import { CONFIG, getCategoryById } from './config.js';
import { sanitizeFilename, formatDate } from './utils.js';
import { dropboxAPI } from './dropbox-api.js';
import { claudeAPI } from './claude-api.js';
import { camera } from './camera.js';
import { pdfConverter } from './pdf-converter.js';
import {
  initUI,
  showScreen,
  updateAuthStatus,
  updateProcessingStatus,
  setCurrentImage,
  setMetadata,
  getFormData,
  showSuccess,
  openSettings,
  closeSettings,
  loadSettingsForm,
  getSettingsFormData,
  showToast,
  setSaveButtonEnabled,
  getElements,
  resetForNewScan,
  state
} from './ui.js';

/**
 * Initialize the application
 */
async function init() {
  console.log('SmartScan initializing...');

  // Initialize UI first
  initUI();

  // Register Service Worker
  registerServiceWorker();

  // Initialize APIs
  await initializeAPIs();

  // Bind event handlers
  bindEvents();

  // Check for action parameter (e.g., from PWA shortcut)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('action') === 'scan') {
    startScan();
    // Clear the action param
    window.history.replaceState({}, '', window.location.pathname);
  }

  console.log('SmartScan ready');
}

/**
 * Register Service Worker for PWA
 */
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', registration.scope);

      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showToast('Neue Version verfügbar. Seite neu laden für Update.', 'info', 0);
          }
        });
      });
    } catch (error) {
      console.warn('Service Worker registration failed:', error);
    }
  }
}

/**
 * Initialize API clients
 */
async function initializeAPIs() {
  // Initialize Dropbox
  try {
    await dropboxAPI.init();
  } catch (error) {
    console.error('Dropbox init error:', error);
    showToast(error.message, 'error');
  }

  // Initialize Claude
  claudeAPI.init();

  // Initialize PDF converter
  try {
    await pdfConverter.init();
  } catch (error) {
    console.warn('PDF converter init warning:', error);
  }

  // Update UI with auth status
  updateAuthStatus(dropboxAPI.isAuthenticated(), claudeAPI.isConfigured());

  // Load saved settings into form
  loadSettingsForm({
    dropboxClientId: dropboxAPI.getClientId() || '',
    claudeApiKey: claudeAPI.isConfigured() ? '••••••••••••••••' : ''
  });
}

/**
 * Bind all event handlers
 */
function bindEvents() {
  const el = getElements();

  // Home screen
  el.btnStartScan.addEventListener('click', startScan);

  // Camera screen
  el.btnCapture.addEventListener('click', captureImage);
  el.btnSwitchCamera.addEventListener('click', switchCamera);
  el.btnCameraBack.addEventListener('click', () => {
    camera.stop();
    showScreen('home');
  });
  el.fileUpload.addEventListener('change', handleFileUpload);

  // Edit screen
  el.btnEditBack.addEventListener('click', () => {
    resetForNewScan();
    showScreen('home');
  });
  el.editForm.addEventListener('submit', handleSave);

  // Success screen
  el.btnScanAnother.addEventListener('click', startScan);
  el.btnGoHome.addEventListener('click', () => {
    resetForNewScan();
    showScreen('home');
  });

  // Settings
  el.settingsBtn.addEventListener('click', openSettings);
  el.settingsClose.addEventListener('click', closeSettings);
  el.settingsOverlay.addEventListener('click', closeSettings);
  el.btnDropboxConnect.addEventListener('click', connectDropbox);
  el.btnDropboxDisconnect.addEventListener('click', disconnectDropbox);
  el.btnClearData.addEventListener('click', clearAllData);

  // Save settings on input change and blur
  el.dropboxClientId.addEventListener('change', saveSettings);
  el.dropboxClientId.addEventListener('blur', saveSettings);
  el.btnClaudeSave.addEventListener('click', saveClaudeKey);

  // Logo click returns home
  document.getElementById('logo').addEventListener('click', (e) => {
    e.preventDefault();
    camera.stop();
    resetForNewScan();
    showScreen('home');
  });

  // Handle keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);
}

/**
 * Handle keyboard shortcuts
 * @param {KeyboardEvent} e
 */
function handleKeyboard(e) {
  // Escape closes settings
  if (e.key === 'Escape') {
    closeSettings();
  }

  // Space triggers capture on camera screen
  if (e.key === ' ' && state.screen === 'camera') {
    e.preventDefault();
    captureImage();
  }
}

/**
 * Start scanning workflow
 */
async function startScan() {
  // Check prerequisites
  if (!claudeAPI.isConfigured()) {
    showToast('Bitte Claude API Key in den Einstellungen konfigurieren', 'warning');
    openSettings();
    return;
  }

  if (!dropboxAPI.isAuthenticated()) {
    showToast('Bitte mit Dropbox verbinden', 'warning');
    openSettings();
    return;
  }

  resetForNewScan();
  showScreen('camera');

  // Initialize camera
  try {
    camera.init(
      document.getElementById('camera-video'),
      document.getElementById('camera-canvas')
    );
    await camera.start();
  } catch (error) {
    console.error('Camera error:', error);
    showToast(error.message, 'error');
    showScreen('home');
  }
}

/**
 * Capture image from camera
 */
async function captureImage() {
  try {
    const imageData = await camera.capture();
    camera.stop();
    await processImage(imageData);
  } catch (error) {
    console.error('Capture error:', error);
    showToast('Fehler beim Aufnehmen: ' + error.message, 'error');
  }
}

/**
 * Switch between front and back camera
 */
async function switchCamera() {
  try {
    await camera.switchCamera();
  } catch (error) {
    showToast('Kamera wechseln fehlgeschlagen', 'error');
  }
}

/**
 * Handle file upload from gallery
 * @param {Event} e
 */
async function handleFileUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    camera.stop();
    camera.init(null, document.getElementById('camera-canvas'));
    const imageData = await camera.processFile(file);
    await processImage(imageData);
  } catch (error) {
    console.error('File upload error:', error);
    showToast('Fehler beim Laden: ' + error.message, 'error');
  }

  // Reset input
  e.target.value = '';
}

/**
 * Process captured image with AI analysis
 * @param {Object} imageData - { blob, base64, dataUrl }
 */
async function processImage(imageData) {
  setCurrentImage(imageData);
  showScreen('processing');
  updateProcessingStatus('Dokument wird analysiert...', 'KI erkennt Dokumentdetails');

  try {
    // Analyze with Claude
    const metadata = await claudeAPI.analyzeDocument(
      imageData.base64,
      'image/jpeg'
    );

    console.log('Analysis result:', metadata);
    setMetadata(metadata);

    // Show edit screen
    showScreen('edit');

  } catch (error) {
    console.error('Analysis error:', error);

    if (error.message.includes('API Key')) {
      showToast('Claude API Key ungültig oder nicht konfiguriert', 'error');
      openSettings();
    } else {
      showToast('Analyse fehlgeschlagen: ' + error.message, 'error');
    }

    // Still allow manual entry
    setMetadata({
      category: 'other',
      date: formatDate(new Date()),
      name: 'Dokument',
      confidence: 0
    });
    showScreen('edit');
  }
}

/**
 * Handle save form submission
 * @param {Event} e
 */
async function handleSave(e) {
  e.preventDefault();

  const formData = getFormData();

  // Validate
  if (!formData.category || !formData.date || !formData.name) {
    showToast('Bitte alle Pflichtfelder ausfüllen', 'warning');
    return;
  }

  setSaveButtonEnabled(false);
  showScreen('processing');
  updateProcessingStatus('PDF wird erstellt...', 'Dokument wird konvertiert');

  try {
    // Generate filename
    const category = getCategoryById(formData.category);
    const sanitizedName = sanitizeFilename(formData.name);
    const filename = `${formData.date}_${sanitizedName}.pdf`;
    const folder = `${CONFIG.dropbox.baseFolder}/${category.folder}`;
    const path = `${folder}/${filename}`;

    // Convert to PDF
    updateProcessingStatus('PDF wird erstellt...', 'Konvertierung läuft');
    const pdfBlob = await pdfConverter.convert(state.currentImage.dataUrl, {
      name: formData.name,
      category: formData.category
    });

    // Upload to Dropbox
    updateProcessingStatus('Wird hochgeladen...', 'Speichern in Dropbox');
    await dropboxAPI.uploadFile(pdfBlob, path);

    // Show success
    showSuccess({
      filename,
      folder,
      category: formData.category
    });

    showToast('Dokument erfolgreich gespeichert', 'success');

  } catch (error) {
    console.error('Save error:', error);
    showToast('Speichern fehlgeschlagen: ' + error.message, 'error');
    showScreen('edit');
  } finally {
    setSaveButtonEnabled(true);
  }
}

/**
 * Connect to Dropbox
 */
async function connectDropbox() {
  const settings = getSettingsFormData();

  if (!settings.dropboxClientId) {
    showToast('Bitte Dropbox Client ID eingeben', 'warning');
    return;
  }

  // Save client ID first
  dropboxAPI.setClientId(settings.dropboxClientId);

  try {
    await dropboxAPI.authorize();
    // Note: This will redirect to Dropbox
  } catch (error) {
    showToast('Verbindung fehlgeschlagen: ' + error.message, 'error');
  }
}

/**
 * Disconnect from Dropbox
 */
function disconnectDropbox() {
  dropboxAPI.clearTokens();
  updateAuthStatus(false, claudeAPI.isConfigured());
  showToast('Dropbox-Verbindung getrennt', 'info');
}

/**
 * Save settings
 */
function saveSettings() {
  const settings = getSettingsFormData();

  if (settings.dropboxClientId) {
    dropboxAPI.setClientId(settings.dropboxClientId);
  }

  updateAuthStatus(dropboxAPI.isAuthenticated(), claudeAPI.isConfigured());
}

/**
 * Save Claude API key with feedback
 */
function saveClaudeKey() {
  const settings = getSettingsFormData();
  const key = settings.claudeApiKey;

  // Don't save if it's the masked placeholder or empty
  if (!key || key.startsWith('••')) {
    showToast('Bitte API Key eingeben', 'warning');
    return;
  }

  // Validate key format (sk-ant- or sk-)
  if (!key.startsWith('sk-')) {
    showToast('Ungültiges API Key Format. Muss mit "sk-" beginnen.', 'warning');
    return;
  }

  claudeAPI.setApiKey(key);
  updateAuthStatus(dropboxAPI.isAuthenticated(), claudeAPI.isConfigured());
  showToast('Claude API Key gespeichert', 'success');

  // Show masked value
  const el = getElements();
  el.claudeApiKey.value = '••••••••••••••••';
}

/**
 * Clear all stored data
 */
function clearAllData() {
  if (!confirm('Alle gespeicherten Daten (API-Keys, Token, Einstellungen) löschen?')) {
    return;
  }

  // Clear all storage
  localStorage.clear();
  sessionStorage.clear();

  // Clear API clients
  dropboxAPI.clearTokens();
  claudeAPI.clearApiKey();

  // Clear cache
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }

  // Reset UI
  updateAuthStatus(false, false);
  loadSettingsForm({ dropboxClientId: '', claudeApiKey: '' });
  closeSettings();

  showToast('Alle Daten gelöscht', 'success');
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
