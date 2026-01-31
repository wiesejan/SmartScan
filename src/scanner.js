/**
 * SmartScan Document Scanner Module
 * Edge detection, perspective correction, and image enhancement using OpenCV.js
 */

/**
 * Document Scanner class
 */
class DocumentScanner {
  constructor() {
    this.isReady = false;
    this.cv = null;
  }

  /**
   * Initialize OpenCV.js
   * @returns {Promise<void>}
   */
  async init() {
    if (this.isReady) return;

    // Wait for OpenCV to be ready
    if (typeof cv !== 'undefined' && cv.Mat) {
      this.cv = cv;
      this.isReady = true;
      console.log('OpenCV.js ready');
      return;
    }

    // Wait for OpenCV to load
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (typeof cv !== 'undefined' && cv.Mat) {
          clearInterval(checkInterval);
          this.cv = cv;
          this.isReady = true;
          console.log('OpenCV.js ready');
          resolve();
        }
      }, 100);

      // Timeout after 30 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!this.isReady) {
          reject(new Error('OpenCV.js failed to load'));
        }
      }, 30000);
    });
  }

  /**
   * Detect document edges in an image
   * @param {HTMLImageElement|HTMLCanvasElement} source - Source image
   * @returns {Object} Detection result with corners and confidence
   */
  detectDocument(source) {
    if (!this.isReady) {
      throw new Error('OpenCV not initialized');
    }

    const cv = this.cv;
    const src = cv.imread(source);
    const result = { corners: null, confidence: 0 };

    try {
      // Convert to grayscale
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // Apply Gaussian blur to reduce noise
      const blurred = new cv.Mat();
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

      // Edge detection using Canny
      const edges = new cv.Mat();
      cv.Canny(blurred, edges, 50, 150);

      // Dilate edges to close gaps
      const dilated = new cv.Mat();
      const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
      cv.dilate(edges, dilated, kernel);

      // Find contours
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      // Find the largest quadrilateral
      let maxArea = 0;
      let bestContour = null;

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);

        if (area > maxArea) {
          // Approximate contour to polygon
          const peri = cv.arcLength(contour, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(contour, approx, 0.02 * peri, true);

          // Check if it's a quadrilateral
          if (approx.rows === 4) {
            maxArea = area;
            if (bestContour) bestContour.delete();
            bestContour = approx;
          } else {
            approx.delete();
          }
        }
      }

      // Calculate confidence based on area ratio
      const imageArea = src.rows * src.cols;
      const areaRatio = maxArea / imageArea;

      if (bestContour && areaRatio > 0.1) {
        // Extract corners
        const corners = [];
        for (let i = 0; i < 4; i++) {
          corners.push({
            x: bestContour.data32S[i * 2],
            y: bestContour.data32S[i * 2 + 1]
          });
        }

        // Order corners: top-left, top-right, bottom-right, bottom-left
        result.corners = this.orderCorners(corners);
        result.confidence = Math.min(areaRatio * 2, 1); // 50% coverage = 100% confidence
        bestContour.delete();
      } else {
        // No document found, use image corners
        result.corners = [
          { x: 0, y: 0 },
          { x: src.cols, y: 0 },
          { x: src.cols, y: src.rows },
          { x: 0, y: src.rows }
        ];
        result.confidence = 0;
      }

      // Cleanup
      gray.delete();
      blurred.delete();
      edges.delete();
      dilated.delete();
      kernel.delete();
      contours.delete();
      hierarchy.delete();

    } finally {
      src.delete();
    }

    return result;
  }

  /**
   * Order corners: top-left, top-right, bottom-right, bottom-left
   * @param {Array} corners - Array of corner points
   * @returns {Array} Ordered corners
   */
  orderCorners(corners) {
    // Sort by y-coordinate
    const sorted = [...corners].sort((a, b) => a.y - b.y);

    // Top two points
    const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
    // Bottom two points
    const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);

    return [top[0], top[1], bottom[1], bottom[0]];
  }

  /**
   * Apply perspective transform to extract document
   * @param {HTMLImageElement|HTMLCanvasElement} source - Source image
   * @param {Array} corners - Four corner points
   * @returns {HTMLCanvasElement} Transformed image
   */
  perspectiveTransform(source, corners) {
    if (!this.isReady) {
      throw new Error('OpenCV not initialized');
    }

    const cv = this.cv;
    const src = cv.imread(source);

    try {
      // Calculate output dimensions
      const width = Math.max(
        this.distance(corners[0], corners[1]),
        this.distance(corners[3], corners[2])
      );
      const height = Math.max(
        this.distance(corners[0], corners[3]),
        this.distance(corners[1], corners[2])
      );

      // Source points
      const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
        corners[0].x, corners[0].y,
        corners[1].x, corners[1].y,
        corners[2].x, corners[2].y,
        corners[3].x, corners[3].y
      ]);

      // Destination points
      const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0,
        width, 0,
        width, height,
        0, height
      ]);

      // Get perspective transform matrix
      const M = cv.getPerspectiveTransform(srcPoints, dstPoints);

      // Apply transform
      const dst = new cv.Mat();
      cv.warpPerspective(src, dst, M, new cv.Size(width, height));

      // Convert to canvas
      const canvas = document.createElement('canvas');
      cv.imshow(canvas, dst);

      // Cleanup
      srcPoints.delete();
      dstPoints.delete();
      M.delete();
      dst.delete();

      return canvas;

    } finally {
      src.delete();
    }
  }

  /**
   * Calculate distance between two points
   */
  distance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }

  /**
   * Auto-enhance image (contrast, brightness, sharpness)
   * @param {HTMLImageElement|HTMLCanvasElement} source - Source image
   * @param {Object} options - Enhancement options
   * @returns {HTMLCanvasElement} Enhanced image
   */
  enhance(source, options = {}) {
    if (!this.isReady) {
      throw new Error('OpenCV not initialized');
    }

    const cv = this.cv;
    const {
      contrast = 1.2,
      brightness = 10,
      sharpen = true,
      denoise = true,
      autoLevels = true
    } = options;

    const src = cv.imread(source);
    let result = src.clone();

    try {
      // Auto levels (histogram equalization on L channel)
      if (autoLevels) {
        const lab = new cv.Mat();
        cv.cvtColor(result, lab, cv.COLOR_RGBA2RGB);
        cv.cvtColor(lab, lab, cv.COLOR_RGB2Lab);

        const labChannels = new cv.MatVector();
        cv.split(lab, labChannels);

        // Apply CLAHE to L channel
        const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
        clahe.apply(labChannels.get(0), labChannels.get(0));

        cv.merge(labChannels, lab);
        cv.cvtColor(lab, result, cv.COLOR_Lab2RGB);
        cv.cvtColor(result, result, cv.COLOR_RGB2RGBA);

        lab.delete();
        labChannels.delete();
      }

      // Contrast and brightness adjustment
      if (contrast !== 1 || brightness !== 0) {
        result.convertTo(result, -1, contrast, brightness);
      }

      // Denoise
      if (denoise) {
        const denoised = new cv.Mat();
        cv.fastNlMeansDenoisingColored(result, denoised, 5, 5, 7, 21);
        result.delete();
        result = denoised;
      }

      // Sharpen
      if (sharpen) {
        const sharpened = new cv.Mat();
        const kernel = cv.matFromArray(3, 3, cv.CV_32F, [
          0, -1, 0,
          -1, 5, -1,
          0, -1, 0
        ]);
        cv.filter2D(result, sharpened, -1, kernel);
        kernel.delete();
        result.delete();
        result = sharpened;
      }

      // Convert to canvas
      const canvas = document.createElement('canvas');
      cv.imshow(canvas, result);

      return canvas;

    } finally {
      src.delete();
      result.delete();
    }
  }

  /**
   * Simple enhancement without OpenCV (fallback)
   * @param {HTMLCanvasElement} canvas - Source canvas
   * @param {Object} options - Enhancement options
   * @returns {HTMLCanvasElement} Enhanced canvas
   */
  simpleEnhance(canvas, options = {}) {
    const {
      contrast = 1.2,
      brightness = 10,
      saturation = 1.1
    } = options;

    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      // Apply contrast and brightness
      data[i] = Math.min(255, Math.max(0, (data[i] - 128) * contrast + 128 + brightness));
      data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * contrast + 128 + brightness));
      data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * contrast + 128 + brightness));
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  /**
   * Convert image to black and white (document mode)
   * @param {HTMLImageElement|HTMLCanvasElement} source - Source image
   * @returns {HTMLCanvasElement} B&W image
   */
  toBlackAndWhite(source) {
    if (!this.isReady) {
      throw new Error('OpenCV not initialized');
    }

    const cv = this.cv;
    const src = cv.imread(source);

    try {
      // Convert to grayscale
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // Apply adaptive threshold
      const bw = new cv.Mat();
      cv.adaptiveThreshold(gray, bw, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);

      // Convert to canvas
      const canvas = document.createElement('canvas');
      cv.imshow(canvas, bw);

      // Cleanup
      gray.delete();
      bw.delete();

      return canvas;

    } finally {
      src.delete();
    }
  }

  /**
   * Full document scan pipeline
   * @param {HTMLImageElement|HTMLCanvasElement} source - Source image
   * @param {Object} options - Processing options
   * @returns {Object} Result with processed image and metadata
   */
  async processDocument(source, options = {}) {
    const {
      autoCrop = true,
      autoEnhance = true,
      enhanceOptions = {}
    } = options;

    await this.init();

    let result = {
      canvas: null,
      corners: null,
      confidence: 0,
      cropped: false,
      enhanced: false
    };

    // Detect document
    const detection = this.detectDocument(source);
    result.corners = detection.corners;
    result.confidence = detection.confidence;

    // Apply perspective transform if document detected
    if (autoCrop && detection.confidence > 0.3) {
      result.canvas = this.perspectiveTransform(source, detection.corners);
      result.cropped = true;
    } else {
      // Just copy the source
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = source.width || source.naturalWidth;
      canvas.height = source.height || source.naturalHeight;
      ctx.drawImage(source, 0, 0);
      result.canvas = canvas;
    }

    // Apply enhancement
    if (autoEnhance) {
      try {
        result.canvas = this.enhance(result.canvas, enhanceOptions);
        result.enhanced = true;
      } catch (e) {
        console.warn('Enhancement failed, using simple enhance:', e);
        result.canvas = this.simpleEnhance(result.canvas, enhanceOptions);
        result.enhanced = true;
      }
    }

    return result;
  }
}

// Export singleton instance
export const scanner = new DocumentScanner();
