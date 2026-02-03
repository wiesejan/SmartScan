/**
 * SmartScan Document Scanner Module
 * Edge detection, perspective correction, and image enhancement using OpenCV.js
 */

/**
 * Detection configuration
 */
const DETECTION_CONFIG = {
  // Canny Edge Detection - more sensitive thresholds
  cannyLow: 30,
  cannyHigh: 100,

  // Gaussian Blur
  blurKernelSize: 7,

  // Contour filtering
  minAreaPercent: 0.10,  // Minimum 10% of image
  maxAreaPercent: 0.98,  // Maximum 98% of image

  // Polygon approximation
  epsilon: 0.02,  // 2% of contour length

  // Aspect ratio validation (for A4-like documents)
  minAspectRatio: 0.4,
  maxAspectRatio: 2.5,

  // Morphological operations
  dilateIterations: 2,
  kernelSize: 3
};

/**
 * Document Scanner class
 */
class DocumentScanner {
  constructor() {
    this.isReady = false;
    this.cv = null;
    this.debug = true; // Enable logging
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
   * Log debug messages
   */
  log(...args) {
    if (this.debug) {
      console.log('[Scanner]', ...args);
    }
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
    const result = { corners: null, confidence: 0, reason: null };
    const imageArea = src.rows * src.cols;

    this.log('🔍 Starting document detection...');
    this.log(`  Image size: ${src.cols}x${src.rows} (${imageArea} pixels)`);

    try {
      // Strategy 1: Canny Edge Detection
      let detection = this.detectWithCanny(src, imageArea);

      if (detection.confidence > 0.3) {
        this.log('✅ Document found with Canny strategy');
        result.corners = detection.corners;
        result.confidence = detection.confidence;
        return result;
      }

      this.log('⚠️ Canny detection failed, trying adaptive threshold...');

      // Strategy 2: Adaptive Threshold
      detection = this.detectWithAdaptiveThreshold(src, imageArea);

      if (detection.confidence > 0.3) {
        this.log('✅ Document found with adaptive threshold strategy');
        result.corners = detection.corners;
        result.confidence = detection.confidence;
        return result;
      }

      this.log('⚠️ Adaptive threshold failed, trying color segmentation...');

      // Strategy 3: Color-based segmentation (bright regions)
      detection = this.detectBrightRegion(src, imageArea);

      if (detection.confidence > 0.3) {
        this.log('✅ Document found with color segmentation strategy');
        result.corners = detection.corners;
        result.confidence = detection.confidence;
        return result;
      }

      // No document found - return centered default rectangle
      this.log('❌ No document detected with any strategy');
      result.corners = this.getDefaultCorners(src.cols, src.rows);
      result.confidence = 0;
      result.reason = 'Kein Dokument erkannt';

    } finally {
      src.delete();
    }

    return result;
  }

  /**
   * Detect document using Canny edge detection
   */
  detectWithCanny(src, imageArea) {
    const cv = this.cv;
    const result = { corners: null, confidence: 0 };

    // Convert to grayscale
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Apply bilateral filter to reduce noise while keeping edges
    const filtered = new cv.Mat();
    cv.bilateralFilter(gray, filtered, 9, 75, 75);

    // Apply Gaussian blur
    const blurred = new cv.Mat();
    const ksize = new cv.Size(DETECTION_CONFIG.blurKernelSize, DETECTION_CONFIG.blurKernelSize);
    cv.GaussianBlur(filtered, blurred, ksize, 0);

    // Calculate adaptive Canny thresholds using Otsu
    const otsuThresh = new cv.Mat();
    const otsuVal = cv.threshold(blurred, otsuThresh, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
    const cannyLow = Math.max(10, otsuVal * 0.3);
    const cannyHigh = Math.min(200, otsuVal * 0.9);
    otsuThresh.delete();

    this.log(`  Canny thresholds: ${cannyLow.toFixed(0)} - ${cannyHigh.toFixed(0)} (Otsu: ${otsuVal.toFixed(0)})`);

    // Edge detection using Canny
    const edges = new cv.Mat();
    cv.Canny(blurred, edges, cannyLow, cannyHigh);

    // Dilate edges to close gaps
    const dilated = new cv.Mat();
    const kernel = cv.Mat.ones(DETECTION_CONFIG.kernelSize, DETECTION_CONFIG.kernelSize, cv.CV_8U);
    cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), DETECTION_CONFIG.dilateIterations);

    // Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    this.log(`  Found ${contours.size()} contours`);

    // Find the best quadrilateral
    const bestContour = this.findBestQuadrilateral(contours, imageArea);

    if (bestContour) {
      result.corners = bestContour.corners;
      result.confidence = bestContour.confidence;
    }

    // Cleanup
    gray.delete();
    filtered.delete();
    blurred.delete();
    edges.delete();
    dilated.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();

    return result;
  }

  /**
   * Detect document using adaptive threshold
   */
  detectWithAdaptiveThreshold(src, imageArea) {
    const cv = this.cv;
    const result = { corners: null, confidence: 0 };

    // Convert to grayscale
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Apply adaptive threshold
    const thresh = new cv.Mat();
    cv.adaptiveThreshold(gray, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);

    // Morphological operations to clean up
    const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
    const morphed = new cv.Mat();
    cv.morphologyEx(thresh, morphed, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(morphed, morphed, cv.MORPH_OPEN, kernel);

    // Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(morphed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    this.log(`  Adaptive threshold: found ${contours.size()} contours`);

    // Find the best quadrilateral
    const bestContour = this.findBestQuadrilateral(contours, imageArea);

    if (bestContour) {
      result.corners = bestContour.corners;
      result.confidence = bestContour.confidence;
    }

    // Cleanup
    gray.delete();
    thresh.delete();
    kernel.delete();
    morphed.delete();
    contours.delete();
    hierarchy.delete();

    return result;
  }

  /**
   * Detect bright regions (white paper on dark background)
   */
  detectBrightRegion(src, imageArea) {
    const cv = this.cv;
    const result = { corners: null, confidence: 0 };

    // Convert to HSV
    const hsv = new cv.Mat();
    cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

    // Threshold for white/bright areas (low saturation, high value)
    const low = new cv.Mat(src.rows, src.cols, cv.CV_8UC3, [0, 0, 150, 0]);
    const high = new cv.Mat(src.rows, src.cols, cv.CV_8UC3, [180, 60, 255, 0]);
    const mask = new cv.Mat();
    cv.inRange(hsv, low, high, mask);

    // Morphological operations
    const kernel = cv.Mat.ones(7, 7, cv.CV_8U);
    const morphed = new cv.Mat();
    cv.morphologyEx(mask, morphed, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(morphed, morphed, cv.MORPH_OPEN, kernel);

    // Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(morphed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    this.log(`  Color segmentation: found ${contours.size()} contours`);

    // Find the best quadrilateral
    const bestContour = this.findBestQuadrilateral(contours, imageArea);

    if (bestContour) {
      result.corners = bestContour.corners;
      result.confidence = bestContour.confidence * 0.9; // Slightly lower confidence for this method
    }

    // Cleanup
    hsv.delete();
    low.delete();
    high.delete();
    mask.delete();
    kernel.delete();
    morphed.delete();
    contours.delete();
    hierarchy.delete();

    return result;
  }

  /**
   * Find the best quadrilateral contour
   */
  findBestQuadrilateral(contours, imageArea) {
    const cv = this.cv;
    let best = null;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      const areaPercent = area / imageArea;

      // Skip if area is too small or too large
      if (areaPercent < DETECTION_CONFIG.minAreaPercent ||
          areaPercent > DETECTION_CONFIG.maxAreaPercent) {
        this.log(`  Contour ${i}: area ${(areaPercent * 100).toFixed(1)}% - skipped (size)`);
        continue;
      }

      // Approximate contour to polygon
      const peri = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, DETECTION_CONFIG.epsilon * peri, true);

      const numPoints = approx.rows;
      this.log(`  Contour ${i}: area ${(areaPercent * 100).toFixed(1)}%, points: ${numPoints}`);

      // Accept 4-point polygons, or try to extract corners from more complex shapes
      let corners = null;

      if (numPoints === 4) {
        corners = this.extractCorners(approx);
      } else if (numPoints >= 4 && numPoints <= 8) {
        // Try to fit a bounding quadrilateral
        corners = this.fitQuadrilateral(contour);
      }

      if (corners) {
        // Validate aspect ratio
        const aspectRatio = this.calculateAspectRatio(corners);
        if (aspectRatio < DETECTION_CONFIG.minAspectRatio ||
            aspectRatio > DETECTION_CONFIG.maxAspectRatio) {
          this.log(`    Rejected: aspect ratio ${aspectRatio.toFixed(2)}`);
          approx.delete();
          continue;
        }

        // Check if this is better than current best
        const confidence = Math.min(areaPercent * 2.5, 1);
        if (!best || confidence > best.confidence) {
          best = { corners, confidence, area: areaPercent };
          this.log(`    New best! confidence: ${(confidence * 100).toFixed(0)}%`);
        }
      }

      approx.delete();
    }

    return best;
  }

  /**
   * Extract corners from a 4-point polygon Mat
   */
  extractCorners(approx) {
    const corners = [];
    for (let i = 0; i < 4; i++) {
      corners.push({
        x: approx.data32S[i * 2],
        y: approx.data32S[i * 2 + 1]
      });
    }
    return this.orderCorners(corners);
  }

  /**
   * Fit a quadrilateral to a contour using minAreaRect
   */
  fitQuadrilateral(contour) {
    const cv = this.cv;

    // Get minimum area rectangle
    const rect = cv.minAreaRect(contour);
    const vertices = cv.RotatedRect.points(rect);

    const corners = vertices.map(v => ({ x: v.x, y: v.y }));
    return this.orderCorners(corners);
  }

  /**
   * Calculate aspect ratio of quadrilateral
   */
  calculateAspectRatio(corners) {
    const width = Math.max(
      this.distance(corners[0], corners[1]),
      this.distance(corners[3], corners[2])
    );
    const height = Math.max(
      this.distance(corners[0], corners[3]),
      this.distance(corners[1], corners[2])
    );
    return Math.max(width, height) / Math.min(width, height);
  }

  /**
   * Order corners: top-left, top-right, bottom-right, bottom-left
   * Using centroid-based angle sorting for robustness
   * @param {Array} corners - Array of corner points
   * @returns {Array} Ordered corners
   */
  orderCorners(corners) {
    if (!corners || corners.length !== 4) {
      return corners;
    }

    // Calculate centroid
    const center = {
      x: corners.reduce((sum, p) => sum + p.x, 0) / 4,
      y: corners.reduce((sum, p) => sum + p.y, 0) / 4
    };

    // Calculate angle from center for each point
    const withAngles = corners.map(p => ({
      ...p,
      angle: Math.atan2(p.y - center.y, p.x - center.x)
    }));

    // Sort by angle (counter-clockwise from positive x-axis)
    withAngles.sort((a, b) => a.angle - b.angle);

    // Now find top-left (smallest x + y sum among top two points)
    // After angle sort, points are ordered counter-clockwise
    // We need to rotate to start from top-left

    // Find the point that's most "top-left" (minimum x + y)
    let topLeftIndex = 0;
    let minSum = Infinity;

    for (let i = 0; i < 4; i++) {
      const sum = withAngles[i].x + withAngles[i].y;
      if (sum < minSum) {
        minSum = sum;
        topLeftIndex = i;
      }
    }

    // Rotate array so top-left is first
    const ordered = [];
    for (let i = 0; i < 4; i++) {
      const idx = (topLeftIndex + i) % 4;
      ordered.push({ x: withAngles[idx].x, y: withAngles[idx].y });
    }

    // The order should now be: TL, BL, BR, TR (counter-clockwise)
    // We need: TL, TR, BR, BL (clockwise for our coordinate system)
    return [ordered[0], ordered[3], ordered[2], ordered[1]];
  }

  /**
   * Get default corners (centered rectangle with margin)
   */
  getDefaultCorners(width, height) {
    const marginX = width * 0.1;
    const marginY = height * 0.1;

    return [
      { x: marginX, y: marginY },                    // top-left
      { x: width - marginX, y: marginY },            // top-right
      { x: width - marginX, y: height - marginY },   // bottom-right
      { x: marginX, y: height - marginY }            // bottom-left
    ];
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

      // Ensure minimum dimensions
      const outWidth = Math.max(100, Math.round(width));
      const outHeight = Math.max(100, Math.round(height));

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
        outWidth, 0,
        outWidth, outHeight,
        0, outHeight
      ]);

      // Get perspective transform matrix
      const M = cv.getPerspectiveTransform(srcPoints, dstPoints);

      // Apply transform
      const dst = new cv.Mat();
      cv.warpPerspective(src, dst, M, new cv.Size(outWidth, outHeight));

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
