/**
 * SmartScan Main Application
 * Orchestrates all modules and handles the document workflow
 */

import { CONFIG, getCategoryById } from './config.js';
import { sanitizeFilename, formatDate } from './utils.js';
import { dropboxAPI } from './dropbox-api.js';
import { ocrService } from './ocrService.js';
import { classifier } from './classifier.js';
import { camera } from './camera.js';
import { pdfConverter } from './pdf-converter.js';
import { scanner } from './scanner.js';
import {
  initUI,
  showScreen,
  updateAuthStatus,
  updateProcessingStatus,
  updateProcessingProgress,
  updateClassificationConfidence,
  showCategoryAlternatives,
  updateModelsStatus,
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
  setMultiPageMode,
  addScannedPage,
  removeScannedPage,
  updateMultipageUI,
  updateEditPreviewMultipage,
  showSuccessMultipage,
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
      // Use relative path to work with GitHub Pages subpath
      const swPath = new URL('sw.js', window.location.href).pathname;
      const registration = await navigator.serviceWorker.register(swPath);
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

  // Initialize PDF converter
  try {
    await pdfConverter.init();
  } catch (error) {
    console.warn('PDF converter init warning:', error);
  }

  // Update UI with auth status (no Claude needed anymore)
  updateAuthStatus(dropboxAPI.isAuthenticated());

  // Load saved settings into form
  loadSettingsForm({
    dropboxClientId: dropboxAPI.getClientId() || ''
  });

  // Check if models were preloaded
  const modelsLoaded = localStorage.getItem(CONFIG.storage.modelsLoaded);
  if (modelsLoaded) {
    updateModelsStatus('Modelle bereit (gecached)');
  }
}

/**
 * Bind all event handlers
 */
function bindEvents() {
  const el = getElements();

  // Home screen
  el.btnStartScan.addEventListener('click', () => startScan(false));
  el.btnStartMultipage.addEventListener('click', () => startScan(true));

  // Camera screen
  el.btnCapture.addEventListener('click', captureImage);
  el.btnSwitchCamera.addEventListener('click', switchCamera);
  el.btnCameraBack.addEventListener('click', () => {
    stopAutoDetection();
    camera.stop();
    showScreen('home');
  });
  el.fileUpload.addEventListener('change', handleFileUpload);

  // Crop screen
  el.btnCropBack.addEventListener('click', () => {
    if (state.isMultiPageMode && state.scannedPages.length > 0) {
      // Go back to multipage screen instead of home
      showScreen('multipage');
    } else {
      resetForNewScan();
      showScreen('home');
    }
  });
  el.btnCropApply.addEventListener('click', applyCropAndContinue);
  initCropHandles();

  // Multipage screen
  el.btnMultipageCancel.addEventListener('click', () => {
    resetForNewScan();
    showScreen('home');
  });
  el.btnMultipageAdd.addEventListener('click', () => addPageToMultipage());
  el.btnMultipageFinish.addEventListener('click', () => finishMultipage());
  el.multipagePages.addEventListener('click', handleMultipagePageClick);

  // Edit screen
  el.btnEditBack.addEventListener('click', () => {
    resetForNewScan();
    showScreen('home');
  });
  el.editForm.addEventListener('submit', handleSave);

  // Success screen
  el.btnScanAnother.addEventListener('click', () => startScan(false));
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
  el.btnPreloadModels.addEventListener('click', preloadModels);

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

// Auto-detection state
let detectionState = {
  isRunning: false,
  lastCorners: null,
  stableFrames: 0,
  requiredStableFrames: 15, // ~0.5 seconds at 30fps
  animationFrame: null
};

/**
 * Start scanning workflow
 * @param {boolean} multiPageMode - Whether to scan multiple pages
 */
async function startScan(multiPageMode = false) {
  // Check prerequisites - only Dropbox needed now
  if (!dropboxAPI.isAuthenticated()) {
    showToast('Bitte mit Dropbox verbinden', 'warning');
    openSettings();
    return;
  }

  resetForNewScan();
  setMultiPageMode(multiPageMode);

  if (multiPageMode) {
    // Show multipage management screen first
    showScreen('multipage');
    return;
  }

  showScreen('camera');

  const el = getElements();

  // Initialize camera
  try {
    camera.init(
      document.getElementById('camera-video'),
      document.getElementById('camera-canvas')
    );
    await camera.start();

    // Initialize scanner for auto-detection
    try {
      await scanner.init();
      startAutoDetection();
    } catch (e) {
      console.warn('Auto-detection not available:', e);
      el.cameraStatus.textContent = 'Manuell aufnehmen';
    }
  } catch (error) {
    console.error('Camera error:', error);
    showToast(error.message, 'error');
    showScreen('home');
  }
}

/**
 * Start auto document detection loop
 */
function startAutoDetection() {
  const el = getElements();
  const video = el.cameraVideo;
  const guide = el.cameraGuide;
  const status = el.cameraStatus;

  detectionState.isRunning = true;
  detectionState.stableFrames = 0;
  detectionState.lastCorners = null;

  // Create a temporary canvas for detection
  const detectCanvas = document.createElement('canvas');
  const detectCtx = detectCanvas.getContext('2d');

  // Detect iOS for special handling
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function detectFrame() {
    if (!detectionState.isRunning || state.screen !== 'camera') {
      return;
    }

    try {
      // Capture frame at reduced resolution for performance
      const scale = 0.5;
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      // On iOS, Safari handles orientation internally, so we don't need to rotate
      // The video element displays correctly, and drawImage captures what's displayed
      // For non-iOS, check if rotation is needed
      let needsRotation = false;

      if (!isIOS) {
        const isPortraitDevice = window.innerHeight > window.innerWidth;
        const isLandscapeVideo = videoWidth > videoHeight;
        needsRotation = isPortraitDevice && isLandscapeVideo;
      }

      if (needsRotation) {
        // Video is landscape but device is portrait - rotate for detection
        detectCanvas.width = videoHeight * scale;
        detectCanvas.height = videoWidth * scale;
        detectCtx.save();
        detectCtx.translate(detectCanvas.width, 0);
        detectCtx.rotate(Math.PI / 2);
        detectCtx.drawImage(video, 0, 0, videoWidth * scale, videoHeight * scale);
        detectCtx.restore();
      } else {
        detectCanvas.width = videoWidth * scale;
        detectCanvas.height = videoHeight * scale;
        detectCtx.drawImage(video, 0, 0, detectCanvas.width, detectCanvas.height);
      }

      // Detect document
      const detection = scanner.detectDocument(detectCanvas);

      if (detection.confidence > 0.3) {
        // Scale corners back to video element coordinates
        let corners = detection.corners.map(c => ({
          x: c.x / scale,
          y: c.y / scale
        }));

        // Update guide to show detected area
        // Use the video element's intrinsic size for positioning
        updateCameraGuide(corners, videoWidth, videoHeight);

        // Check stability
        if (isCornersStable(corners)) {
          detectionState.stableFrames++;

          if (detectionState.stableFrames >= detectionState.requiredStableFrames) {
            // Document is stable - auto capture!
            guide.className = 'camera__guide camera__guide--stable';
            status.textContent = 'Aufnahme...';
            status.classList.add('camera__status--ready');

            stopAutoDetection();
            setTimeout(() => captureImage(), 300);
            return;
          } else {
            guide.className = 'camera__guide camera__guide--detected';
            const progress = Math.round((detectionState.stableFrames / detectionState.requiredStableFrames) * 100);
            status.textContent = `Stabilisieren... ${progress}%`;
          }
        } else {
          detectionState.stableFrames = 0;
          guide.className = 'camera__guide camera__guide--detected';
          status.textContent = 'Dokument erkannt - ruhig halten';
        }

        detectionState.lastCorners = corners;
      } else {
        // No document detected
        detectionState.stableFrames = 0;
        detectionState.lastCorners = null;
        guide.className = 'camera__guide camera__guide--searching';
        guide.style.cssText = '';
        status.textContent = 'Dokument suchen...';
        status.classList.remove('camera__status--ready');
      }
    } catch (e) {
      // Detection failed, continue searching
    }

    detectionState.animationFrame = requestAnimationFrame(detectFrame);
  }

  // Start detection loop
  detectionState.animationFrame = requestAnimationFrame(detectFrame);
}

/**
 * Stop auto detection
 */
function stopAutoDetection() {
  detectionState.isRunning = false;
  if (detectionState.animationFrame) {
    cancelAnimationFrame(detectionState.animationFrame);
    detectionState.animationFrame = null;
  }
}

/**
 * Update camera guide to match detected corners
 */
function updateCameraGuide(corners, videoWidth, videoHeight) {
  const el = getElements();
  const guide = el.cameraGuide;
  const viewfinder = el.cameraVideo.parentElement;

  const rect = viewfinder.getBoundingClientRect();
  const scaleX = rect.width / videoWidth;
  const scaleY = rect.height / videoHeight;

  // Calculate bounding box of corners
  const minX = Math.min(...corners.map(c => c.x)) * scaleX;
  const maxX = Math.max(...corners.map(c => c.x)) * scaleX;
  const minY = Math.min(...corners.map(c => c.y)) * scaleY;
  const maxY = Math.max(...corners.map(c => c.y)) * scaleY;

  guide.style.left = minX + 'px';
  guide.style.top = minY + 'px';
  guide.style.width = (maxX - minX) + 'px';
  guide.style.height = (maxY - minY) + 'px';
}

/**
 * Check if detected corners are stable (not moving much)
 */
function isCornersStable(corners) {
  if (!detectionState.lastCorners) return false;

  const threshold = 10; // pixels
  for (let i = 0; i < 4; i++) {
    const dx = Math.abs(corners[i].x - detectionState.lastCorners[i].x);
    const dy = Math.abs(corners[i].y - detectionState.lastCorners[i].y);
    if (dx > threshold || dy > threshold) {
      return false;
    }
  }
  return true;
}

/**
 * Capture image from camera
 */
async function captureImage() {
  stopAutoDetection();

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

      // Detection is already in canvas coordinates (we passed the scaled canvas)
      // No additional scaling needed!
      cropState.corners = detection.corners;

      if (detection.confidence > 0.3) {
        el.cropStatus.textContent = `Dokument erkannt (${Math.round(detection.confidence * 100)}%)`;
      } else {
        el.cropStatus.textContent = 'Ecken manuell anpassen';
      }

      console.log('Crop corners set:', cropState.corners);
    } catch (error) {
      console.warn('Edge detection failed:', error);
      // Default to centered rectangle with margin
      const margin = 0.1;
      cropState.corners = [
        { x: canvas.width * margin, y: canvas.height * margin },
        { x: canvas.width * (1 - margin), y: canvas.height * margin },
        { x: canvas.width * (1 - margin), y: canvas.height * (1 - margin) },
        { x: canvas.width * margin, y: canvas.height * (1 - margin) }
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
 * Apply crop and enhancement, then continue to AI analysis or add to multipage
 */
async function applyCropAndContinue() {
  const el = getElements();

  showScreen('processing');
  updateProcessingStatus('Dokument wird optimiert...', 'Zuschneiden und Verbessern');

  try {
    await scanner.init();

    // Get corners in original image coordinates
    const viewBox = el.cropOverlay.viewBox.baseVal;
    const scaleX = cropState.originalImage.width / viewBox.width;
    const scaleY = cropState.originalImage.height / viewBox.height;

    const originalCorners = cropState.corners.map(c => ({
      x: c.x * scaleX,
      y: c.y * scaleY
    }));

    // Convert Image element to Canvas first to avoid iOS Safari issues
    // where OpenCV might read the image incorrectly
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = cropState.originalImage.width;
    sourceCanvas.height = cropState.originalImage.height;
    const sourceCtx = sourceCanvas.getContext('2d');
    sourceCtx.drawImage(cropState.originalImage, 0, 0);

    console.log(`[Crop] Source canvas: ${sourceCanvas.width}x${sourceCanvas.height}`);
    console.log(`[Crop] Corners:`, originalCorners);

    // Apply perspective transform using canvas instead of Image element
    let resultCanvas = scanner.perspectiveTransform(sourceCanvas, originalCorners);

    // Always apply auto enhancement
    try {
      resultCanvas = scanner.enhance(resultCanvas);
    } catch (e) {
      console.warn('Enhancement failed:', e);
      resultCanvas = scanner.simpleEnhance(resultCanvas);
    }

    // Convert canvas to image data
    const dataUrl = resultCanvas.toDataURL('image/jpeg', 0.9);
    const base64 = dataUrl.split(',')[1];

    const processedImageData = {
      dataUrl,
      base64,
      blob: await (await fetch(dataUrl)).blob()
    };

    // Check if in multipage mode
    if (state.isMultiPageMode) {
      // Add page to collection and return to multipage screen
      addScannedPage(processedImageData);
      showScreen('multipage');
      showToast(`Seite ${state.scannedPages.length} hinzugefugt`, 'success');
    } else {
      // Single page mode - continue to AI analysis
      await processImage(processedImageData);
    }

  } catch (error) {
    console.error('Crop error:', error);
    showToast('Fehler bei Bildoptimierung: ' + error.message, 'error');

    if (state.isMultiPageMode) {
      // Add original image to multipage
      addScannedPage(cropState.imageData);
      showScreen('multipage');
    } else {
      // Continue with original image for single page
      await processImage(cropState.imageData);
    }
  }
}

/**
 * Add a new page to multi-page document
 */
async function addPageToMultipage() {
  showScreen('camera');

  const el = getElements();

  // Initialize camera
  try {
    camera.init(
      document.getElementById('camera-video'),
      document.getElementById('camera-canvas')
    );
    await camera.start();

    // Initialize scanner for auto-detection
    try {
      await scanner.init();
      startAutoDetection();
    } catch (e) {
      console.warn('Auto-detection not available:', e);
      el.cameraStatus.textContent = 'Manuell aufnehmen';
    }
  } catch (error) {
    console.error('Camera error:', error);
    showToast(error.message, 'error');
    showScreen('multipage');
  }
}

/**
 * Finish multi-page document and process
 */
async function finishMultipage() {
  if (state.scannedPages.length === 0) {
    showToast('Bitte mindestens eine Seite scannen', 'warning');
    return;
  }

  // Process all pages
  await processMultiplePages(state.scannedPages);
}

/**
 * Handle click on multipage page (for remove button)
 * @param {Event} e
 */
function handleMultipagePageClick(e) {
  const removeBtn = e.target.closest('.multipage__page-remove');
  if (removeBtn) {
    const index = parseInt(removeBtn.dataset.index, 10);
    removeScannedPage(index);
    showToast('Seite entfernt', 'info');
  }
}

/**
 * Process multiple pages with local OCR and classification
 * @param {Array} pages - Array of { imageData: { blob, base64, dataUrl } }
 */
async function processMultiplePages(pages) {
  showScreen('processing');
  updateProcessingProgress(0, true);
  updateProcessingStatus('OCR wird initialisiert...', 'Texterkennung wird vorbereitet');

  try {
    // Initialize OCR with progress callback
    await ocrService.init((percent, status) => {
      updateProcessingProgress(percent * 0.3, true); // OCR init is 0-30%
      updateProcessingStatus('OCR wird geladen...', status);
    });

    updateProcessingProgress(30, true);
    updateProcessingStatus('Text wird erkannt...', `${pages.length} Seiten werden gelesen`);

    // Perform OCR on all pages
    let combinedText = '';
    const pageTexts = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      updateProcessingStatus('Text wird erkannt...', `Seite ${i + 1} von ${pages.length}`);

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = page.imageData.dataUrl;
      });

      const ocrResult = await ocrService.recognize(img);
      pageTexts.push(ocrResult.text);
      combinedText += ocrResult.text + '\n\n';

      const progress = 30 + ((i + 1) / pages.length) * 40;
      updateProcessingProgress(progress, true);
    }

    console.log('Combined OCR text:', combinedText.slice(0, 500) + '...');

    // Extract structured data from combined text
    const structuredData = ocrService.extractStructuredData(combinedText);
    console.log('Structured data:', structuredData);

    updateProcessingProgress(70, true);
    updateProcessingStatus('Dokument wird klassifiziert...', 'Kategorie wird ermittelt');

    // Initialize classifier
    await classifier.init({
      useML: CONFIG.classifier.useML,
      onProgress: (percent, status) => {
        updateProcessingProgress(70 + percent * 0.25, true);
        updateProcessingStatus('Klassifizierer wird geladen...', status);
      }
    });

    // Classify based on combined text
    const ocrResult = { text: combinedText, structuredData };
    const classification = await classifier.classify(ocrResult);
    console.log('Classification result:', classification);

    updateProcessingProgress(100, true);

    // Build metadata from classification
    const metadata = {
      category: classification.category,
      date: classification.date || formatDate(new Date()),
      name: classification.name || 'Dokument',
      sender: classification.sender,
      amount: classification.amount,
      confidence: classification.confidence,
      pageCount: pages.length
    };

    console.log('Final metadata:', metadata);
    setMetadata(metadata);

    // Update classification confidence UI
    updateClassificationConfidence(classification.confidence);

    // Show alternatives if confidence is low
    if (classification.confidence < CONFIG.classifier.showReviewIfBelow) {
      const alternatives = classifier.getAlternatives(classification);
      showCategoryAlternatives(alternatives);
    }

    // Update edit preview for multipage
    updateEditPreviewMultipage();

    // Show edit screen
    updateProcessingProgress(0, false);
    showScreen('edit');

  } catch (error) {
    console.error('Analysis error:', error);
    showToast('Analyse fehlgeschlagen: ' + error.message, 'error');

    // Still allow manual entry
    setMetadata({
      category: 'other',
      date: formatDate(new Date()),
      name: 'Dokument',
      confidence: 0,
      pageCount: pages.length
    });
    updateClassificationConfidence(0);
    updateEditPreviewMultipage();
    updateProcessingProgress(0, false);
    showScreen('edit');
  }
}

/**
 * Process captured image with local OCR and classification
 * @param {Object} imageData - { blob, base64, dataUrl }
 */
async function processImage(imageData) {
  setCurrentImage(imageData);
  showScreen('processing');
  updateProcessingProgress(0, true);
  updateProcessingStatus('OCR wird initialisiert...', 'Texterkennung wird vorbereitet');

  try {
    // Initialize OCR with progress callback
    await ocrService.init((percent, status) => {
      updateProcessingProgress(percent * 0.5, true); // OCR is 0-50%
      updateProcessingStatus('OCR wird geladen...', status);
    });

    updateProcessingProgress(50, true);
    updateProcessingStatus('Text wird erkannt...', 'Dokument wird gelesen');

    // Create an image element from dataUrl for OCR
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageData.dataUrl;
    });

    // Perform OCR
    const ocrResult = await ocrService.recognize(img);
    console.log('OCR result:', ocrResult.text.slice(0, 200) + '...');

    // Extract structured data
    ocrResult.structuredData = ocrService.extractStructuredData(ocrResult.text);
    console.log('Structured data:', ocrResult.structuredData);

    updateProcessingProgress(70, true);
    updateProcessingStatus('Dokument wird klassifiziert...', 'Kategorie wird ermittelt');

    // Initialize classifier
    await classifier.init({
      useML: CONFIG.classifier.useML,
      onProgress: (percent, status) => {
        updateProcessingProgress(70 + percent * 0.25, true);
        updateProcessingStatus('Klassifizierer wird geladen...', status);
      }
    });

    // Classify document
    const classification = await classifier.classify(ocrResult);
    console.log('Classification result:', classification);

    updateProcessingProgress(100, true);

    // Build metadata from classification
    const metadata = {
      category: classification.category,
      date: classification.date || formatDate(new Date()),
      name: classification.name || 'Dokument',
      sender: classification.sender,
      amount: classification.amount,
      confidence: classification.confidence
    };

    console.log('Final metadata:', metadata);
    setMetadata(metadata);

    // Update classification confidence UI
    updateClassificationConfidence(classification.confidence);

    // Show alternatives if confidence is low
    if (classification.confidence < CONFIG.classifier.showReviewIfBelow) {
      const alternatives = classifier.getAlternatives(classification);
      showCategoryAlternatives(alternatives);
    }

    // Show edit screen
    updateProcessingProgress(0, false);
    showScreen('edit');

  } catch (error) {
    console.error('Analysis error:', error);
    showToast('Analyse fehlgeschlagen: ' + error.message, 'error');

    // Still allow manual entry
    setMetadata({
      category: 'other',
      date: formatDate(new Date()),
      name: 'Dokument',
      confidence: 0
    });
    updateClassificationConfidence(0);
    updateProcessingProgress(0, false);
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

    let pdfBlob;
    let pageCount = 1;

    // Check if multipage mode
    if (state.isMultiPageMode && state.scannedPages.length > 0) {
      // Convert multiple pages to PDF
      pageCount = state.scannedPages.length;
      updateProcessingStatus('PDF wird erstellt...', `${pageCount} Seiten werden konvertiert`);

      const imageDataUrls = state.scannedPages.map(p => p.imageData.dataUrl);
      pdfBlob = await pdfConverter.convertMultiple(imageDataUrls, {
        name: formData.name,
        category: formData.category
      });
    } else {
      // Single page PDF
      updateProcessingStatus('PDF wird erstellt...', 'Konvertierung läuft');
      pdfBlob = await pdfConverter.convert(state.currentImage.dataUrl, {
        name: formData.name,
        category: formData.category
      });
    }

    // Upload to Dropbox
    updateProcessingStatus('Wird hochgeladen...', 'Speichern in Dropbox');
    await dropboxAPI.uploadFile(pdfBlob, path);

    // Show success
    if (pageCount > 1) {
      showSuccessMultipage({
        filename,
        folder,
        category: formData.category,
        pageCount
      });
    } else {
      showSuccess({
        filename,
        folder,
        category: formData.category
      });
    }

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
 * Preload OCR and classifier models
 */
async function preloadModels() {
  const el = getElements();
  el.btnPreloadModels.disabled = true;
  updateModelsStatus('Modelle werden geladen...');

  try {
    // Initialize OCR
    await ocrService.init((percent, status) => {
      updateModelsStatus(`OCR: ${status} (${Math.round(percent)}%)`);
    });

    // Initialize classifier
    await classifier.init({
      useML: CONFIG.classifier.useML,
      onProgress: (percent, status) => {
        updateModelsStatus(`Klassifizierer: ${status} (${Math.round(percent)}%)`);
      }
    });

    // Mark as loaded
    localStorage.setItem(CONFIG.storage.modelsLoaded, 'true');
    updateModelsStatus('Modelle bereit (gecached)');
    showToast('Modelle erfolgreich geladen', 'success');

  } catch (error) {
    console.error('Model preload error:', error);
    updateModelsStatus('Fehler beim Laden: ' + error.message);
    showToast('Modelle konnten nicht geladen werden', 'error');
  } finally {
    el.btnPreloadModels.disabled = false;
  }
}

/**
 * Clear all stored data
 */
function clearAllData() {
  if (!confirm('Alle gespeicherten Daten (Token, Einstellungen, gecachte Modelle) löschen?')) {
    return;
  }

  // Clear all storage
  localStorage.clear();
  sessionStorage.clear();

  // Clear API clients
  dropboxAPI.clearTokens();

  // Terminate OCR worker if running
  ocrService.terminate().catch(() => {});

  // Clear cache (including model cache)
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }

  // Clear IndexedDB (Tesseract cache)
  if ('indexedDB' in window) {
    indexedDB.databases().then(dbs => {
      dbs.forEach(db => {
        if (db.name && db.name.includes('tesseract')) {
          indexedDB.deleteDatabase(db.name);
        }
      });
    }).catch(() => {});
  }

  // Reset UI
  updateAuthStatus(false);
  updateModelsStatus('Modelle werden bei Bedarf geladen');
  loadSettingsForm({ dropboxClientId: '' });
  closeSettings();

  showToast('Alle Daten gelöscht', 'success');
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
