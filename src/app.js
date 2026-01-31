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
import { scanner } from './scanner.js';
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

  // Crop screen
  el.btnCropBack.addEventListener('click', () => {
    resetForNewScan();
    showScreen('home');
  });
  el.btnCropApply.addEventListener('click', applyCropAndContinue);
  initCropHandles();

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
    await showCropScreen(imageData);
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
    await showCropScreen(imageData);
  } catch (error) {
    console.error('File upload error:', error);
    showToast('Fehler beim Laden: ' + error.message, 'error');
  }

  // Reset input
  e.target.value = '';
}

// Store current crop state
let cropState = {
  imageData: null,
  corners: null,
  originalImage: null
};

/**
 * Show the crop screen with edge detection
 * @param {Object} imageData - { blob, base64, dataUrl }
 */
async function showCropScreen(imageData) {
  cropState.imageData = imageData;
  const el = getElements();

  // Show crop screen
  showScreen('crop');
  el.cropStatus.textContent = 'Dokument wird erkannt...';

  // Load image onto canvas
  const img = new Image();
  img.onload = async () => {
    cropState.originalImage = img;

    // Set canvas size
    const canvas = el.cropCanvas;
    const container = canvas.parentElement;
    const maxWidth = container.clientWidth;
    const maxHeight = container.clientHeight;

    // Calculate scale to fit
    const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;

    // Draw image
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Position overlay to match canvas exactly
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    el.cropOverlay.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
    el.cropOverlay.style.width = canvas.width + 'px';
    el.cropOverlay.style.height = canvas.height + 'px';
    el.cropOverlay.style.left = (canvasRect.left - containerRect.left) + 'px';
    el.cropOverlay.style.top = (canvasRect.top - containerRect.top) + 'px';

    // Try to detect document edges
    try {
      await scanner.init();
      const detection = scanner.detectDocument(canvas);
      cropState.corners = detection.corners.map(c => ({
        x: c.x * scale,
        y: c.y * scale
      }));

      if (detection.confidence > 0.3) {
        el.cropStatus.textContent = `Dokument erkannt (${Math.round(detection.confidence * 100)}%)`;
      } else {
        el.cropStatus.textContent = 'Ecken manuell anpassen';
      }
    } catch (error) {
      console.warn('Edge detection failed:', error);
      // Default to image corners
      cropState.corners = [
        { x: 20, y: 20 },
        { x: canvas.width - 20, y: 20 },
        { x: canvas.width - 20, y: canvas.height - 20 },
        { x: 20, y: canvas.height - 20 }
      ];
      el.cropStatus.textContent = 'Ecken manuell anpassen';
    }

    // Update polygon and handles
    updateCropOverlay();
  };

  img.src = imageData.dataUrl;
}

/**
 * Update the crop overlay polygon and handles
 */
function updateCropOverlay() {
  const el = getElements();
  const corners = cropState.corners;

  if (!corners) return;

  // Update polygon
  const points = corners.map(c => `${c.x},${c.y}`).join(' ');
  el.cropPolygon.setAttribute('points', points);

  // Update handles
  el.cropHandles.tl.setAttribute('cx', corners[0].x);
  el.cropHandles.tl.setAttribute('cy', corners[0].y);
  el.cropHandles.tr.setAttribute('cx', corners[1].x);
  el.cropHandles.tr.setAttribute('cy', corners[1].y);
  el.cropHandles.br.setAttribute('cx', corners[2].x);
  el.cropHandles.br.setAttribute('cy', corners[2].y);
  el.cropHandles.bl.setAttribute('cx', corners[3].x);
  el.cropHandles.bl.setAttribute('cy', corners[3].y);
}

/**
 * Initialize crop handle dragging
 */
function initCropHandles() {
  const el = getElements();
  const handles = ['tl', 'tr', 'br', 'bl'];

  handles.forEach((handle, index) => {
    const element = el.cropHandles[handle];
    let isDragging = false;

    const startDrag = (e) => {
      e.preventDefault();
      isDragging = true;
      element.style.cursor = 'grabbing';
    };

    const doDrag = (e) => {
      if (!isDragging || !cropState.corners) return;

      const svg = el.cropOverlay;
      const rect = svg.getBoundingClientRect();
      const viewBox = svg.viewBox.baseVal;

      // Get pointer position
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      // Convert to SVG coordinates
      const x = ((clientX - rect.left) / rect.width) * viewBox.width;
      const y = ((clientY - rect.top) / rect.height) * viewBox.height;

      // Clamp to canvas bounds
      cropState.corners[index] = {
        x: Math.max(0, Math.min(viewBox.width, x)),
        y: Math.max(0, Math.min(viewBox.height, y))
      };

      updateCropOverlay();
    };

    const endDrag = () => {
      isDragging = false;
      element.style.cursor = 'move';
    };

    // Mouse events
    element.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', endDrag);

    // Touch events
    element.addEventListener('touchstart', startDrag, { passive: false });
    document.addEventListener('touchmove', doDrag, { passive: false });
    document.addEventListener('touchend', endDrag);
  });
}

/**
 * Apply crop and enhancement, then continue to AI analysis
 */
async function applyCropAndContinue() {
  const el = getElements();

  showScreen('processing');
  updateProcessingStatus('Dokument wird optimiert...', 'Zuschneiden und Verbessern');

  try {
    const canvas = el.cropCanvas;
    const autoEnhance = el.cropAutoEnhance.checked;
    const bwMode = el.cropBwMode.checked;

    await scanner.init();

    // Get corners in original image coordinates
    const viewBox = el.cropOverlay.viewBox.baseVal;
    const scaleX = cropState.originalImage.width / viewBox.width;
    const scaleY = cropState.originalImage.height / viewBox.height;

    const originalCorners = cropState.corners.map(c => ({
      x: c.x * scaleX,
      y: c.y * scaleY
    }));

    // Apply perspective transform
    let resultCanvas = scanner.perspectiveTransform(cropState.originalImage, originalCorners);

    // Apply enhancements
    if (bwMode) {
      resultCanvas = scanner.toBlackAndWhite(resultCanvas);
    } else if (autoEnhance) {
      try {
        resultCanvas = scanner.enhance(resultCanvas);
      } catch (e) {
        console.warn('Enhancement failed:', e);
        resultCanvas = scanner.simpleEnhance(resultCanvas);
      }
    }

    // Convert canvas to image data
    const dataUrl = resultCanvas.toDataURL('image/jpeg', 0.9);
    const base64 = dataUrl.split(',')[1];

    const processedImageData = {
      dataUrl,
      base64,
      blob: await (await fetch(dataUrl)).blob()
    };

    // Continue to AI analysis
    await processImage(processedImageData);

  } catch (error) {
    console.error('Crop error:', error);
    showToast('Fehler bei Bildoptimierung: ' + error.message, 'error');
    // Continue with original image
    await processImage(cropState.imageData);
  }
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
