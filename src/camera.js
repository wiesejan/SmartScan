/**
 * SmartScan Camera Module
 * Handles camera access, image capture, and compression
 */

import { CONFIG } from './config.js';
import { blobToBase64 } from './utils.js';

/**
 * Camera controller for capturing document images
 */
class CameraController {
  constructor() {
    this.videoElement = null;
    this.canvasElement = null;
    this.stream = null;
    this.facingMode = 'environment'; // 'environment' = back camera, 'user' = front camera
    this.capabilities = null;
  }

  /**
   * Initialize the camera controller
   * @param {HTMLVideoElement} videoElement
   * @param {HTMLCanvasElement} canvasElement
   */
  init(videoElement, canvasElement) {
    this.videoElement = videoElement;
    this.canvasElement = canvasElement;
  }

  /**
   * Check if camera is available
   * @returns {boolean}
   */
  isAvailable() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /**
   * Start the camera stream
   * @returns {Promise<void>}
   */
  async start() {
    if (!this.isAvailable()) {
      throw new Error('Kamera nicht verfügbar');
    }

    // Stop existing stream if any
    this.stop();

    const constraints = {
      video: {
        facingMode: this.facingMode,
        width: { ideal: CONFIG.image.maxWidth },
        height: { ideal: CONFIG.image.maxHeight }
      },
      audio: false
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        await this.videoElement.play();
      }

      // Get capabilities for zoom, focus, etc.
      const track = this.stream.getVideoTracks()[0];
      if (track.getCapabilities) {
        this.capabilities = track.getCapabilities();
      }

    } catch (error) {
      if (error.name === 'NotAllowedError') {
        throw new Error('Kamerazugriff verweigert. Bitte erlauben Sie den Zugriff in den Browsereinstellungen.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('Keine Kamera gefunden');
      } else if (error.name === 'NotReadableError') {
        throw new Error('Kamera wird bereits von einer anderen Anwendung verwendet');
      }
      throw error;
    }
  }

  /**
   * Stop the camera stream
   */
  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  /**
   * Switch between front and back camera
   * @returns {Promise<void>}
   */
  async switchCamera() {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    await this.start();
  }

  /**
   * Capture an image from the video stream
   * @returns {Promise<{blob: Blob, base64: string, dataUrl: string}>}
   */
  async capture() {
    if (!this.videoElement || !this.canvasElement) {
      throw new Error('Camera not initialized');
    }

    const video = this.videoElement;
    const canvas = this.canvasElement;
    const ctx = canvas.getContext('2d');

    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get blob and compress if needed
    const blob = await this.compressImage(canvas);
    const base64 = await blobToBase64(blob);
    const dataUrl = `data:${blob.type};base64,${base64}`;

    return { blob, base64, dataUrl };
  }

  /**
   * Process an uploaded image file
   * @param {File} file - Image file
   * @returns {Promise<{blob: Blob, base64: string, dataUrl: string}>}
   */
  async processFile(file) {
    if (!file.type.startsWith('image/')) {
      throw new Error('Bitte wählen Sie eine Bilddatei');
    }

    // Load image
    const img = await this.loadImage(file);

    // Draw to canvas for processing
    const canvas = this.canvasElement || document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Calculate dimensions while maintaining aspect ratio
    let { width, height } = img;
    const maxDim = Math.max(CONFIG.image.maxWidth, CONFIG.image.maxHeight);

    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round(height * maxDim / width);
        width = maxDim;
      } else {
        width = Math.round(width * maxDim / height);
        height = maxDim;
      }
    }

    canvas.width = width;
    canvas.height = height;

    // Handle EXIF orientation
    const orientation = await this.getExifOrientation(file);
    this.applyOrientation(ctx, canvas, orientation);

    // Draw image
    ctx.drawImage(img, 0, 0, width, height);

    // Compress and return
    const blob = await this.compressImage(canvas);
    const base64 = await blobToBase64(blob);
    const dataUrl = `data:${blob.type};base64,${base64}`;

    return { blob, base64, dataUrl };
  }

  /**
   * Load an image file
   * @param {File|Blob} file
   * @returns {Promise<HTMLImageElement>}
   */
  loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Get EXIF orientation from image file
   * @param {File} file
   * @returns {Promise<number>}
   */
  async getExifOrientation(file) {
    try {
      const buffer = await file.slice(0, 65536).arrayBuffer();
      const view = new DataView(buffer);

      if (view.getUint16(0, false) !== 0xFFD8) {
        return 1; // Not a JPEG
      }

      let offset = 2;
      while (offset < view.byteLength) {
        const marker = view.getUint16(offset, false);
        offset += 2;

        if (marker === 0xFFE1) { // APP1 marker
          if (view.getUint32(offset + 2, false) === 0x45786966) { // "Exif"
            const little = view.getUint16(offset + 10, false) === 0x4949;
            const tags = view.getUint16(offset + 16, little);

            for (let i = 0; i < tags; i++) {
              const tagOffset = offset + 18 + i * 12;
              if (view.getUint16(tagOffset, little) === 0x0112) { // Orientation tag
                return view.getUint16(tagOffset + 8, little);
              }
            }
          }
          break;
        } else if ((marker & 0xFF00) !== 0xFF00) {
          break;
        } else {
          offset += view.getUint16(offset, false);
        }
      }
    } catch (e) {
      console.warn('Failed to read EXIF:', e);
    }

    return 1; // Default orientation
  }

  /**
   * Apply EXIF orientation transform to canvas context
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLCanvasElement} canvas
   * @param {number} orientation
   */
  applyOrientation(ctx, canvas, orientation) {
    const width = canvas.width;
    const height = canvas.height;

    switch (orientation) {
      case 2: // Flip horizontal
        ctx.transform(-1, 0, 0, 1, width, 0);
        break;
      case 3: // Rotate 180
        ctx.transform(-1, 0, 0, -1, width, height);
        break;
      case 4: // Flip vertical
        ctx.transform(1, 0, 0, -1, 0, height);
        break;
      case 5: // Rotate 90 + flip
        canvas.width = height;
        canvas.height = width;
        ctx.transform(0, 1, 1, 0, 0, 0);
        break;
      case 6: // Rotate 90
        canvas.width = height;
        canvas.height = width;
        ctx.transform(0, 1, -1, 0, height, 0);
        break;
      case 7: // Rotate 270 + flip
        canvas.width = height;
        canvas.height = width;
        ctx.transform(0, -1, -1, 0, height, width);
        break;
      case 8: // Rotate 270
        canvas.width = height;
        canvas.height = width;
        ctx.transform(0, -1, 1, 0, 0, width);
        break;
    }
  }

  /**
   * Compress image on canvas to meet size requirements
   * @param {HTMLCanvasElement} canvas
   * @returns {Promise<Blob>}
   */
  async compressImage(canvas) {
    let quality = CONFIG.image.quality;
    let blob;

    // Try to get under max size
    while (quality >= 0.3) {
      blob = await new Promise(resolve => {
        canvas.toBlob(resolve, CONFIG.image.outputFormat, quality);
      });

      if (blob.size <= CONFIG.image.maxSizeBytes) {
        break;
      }

      quality -= 0.1;
    }

    // If still too large, resize
    if (blob.size > CONFIG.image.maxSizeBytes) {
      const scale = Math.sqrt(CONFIG.image.maxSizeBytes / blob.size);
      const newWidth = Math.floor(canvas.width * scale);
      const newHeight = Math.floor(canvas.height * scale);

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = newWidth;
      tempCanvas.height = newHeight;
      const ctx = tempCanvas.getContext('2d');
      ctx.drawImage(canvas, 0, 0, newWidth, newHeight);

      blob = await new Promise(resolve => {
        tempCanvas.toBlob(resolve, CONFIG.image.outputFormat, CONFIG.image.quality);
      });
    }

    return blob;
  }
}

// Export singleton instance
export const camera = new CameraController();
