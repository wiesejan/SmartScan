/**
 * SmartScan PDF Converter
 * Converts captured images to PDF documents
 */

import { CONFIG } from './config.js';

/**
 * PDF converter using jsPDF
 */
class PDFConverter {
  constructor() {
    this.jsPDF = null;
  }

  /**
   * Initialize the converter
   * Waits for jsPDF library to be available
   */
  async init() {
    // Wait for jsPDF to be loaded
    if (typeof window.jspdf !== 'undefined') {
      this.jsPDF = window.jspdf.jsPDF;
      return true;
    }

    // Wait up to 5 seconds for library to load
    for (let i = 0; i < 50; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (typeof window.jspdf !== 'undefined') {
        this.jsPDF = window.jspdf.jsPDF;
        return true;
      }
    }

    throw new Error('jsPDF library not loaded');
  }

  /**
   * Check if converter is ready
   * @returns {boolean}
   */
  isReady() {
    return !!this.jsPDF;
  }

  /**
   * Convert an image to PDF
   * @param {string} imageDataUrl - Image as data URL
   * @param {Object} metadata - Document metadata
   * @returns {Promise<Blob>} PDF as Blob
   */
  async convert(imageDataUrl, metadata = {}) {
    if (!this.jsPDF) {
      await this.init();
    }

    // Create PDF document
    const pdf = new this.jsPDF({
      orientation: CONFIG.pdf.orientation,
      unit: 'mm',
      format: CONFIG.pdf.pageFormat
    });

    // Get page dimensions
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = CONFIG.pdf.margin; // 5mm = 0.5cm

    // Calculate image position with minimal margins
    const { x, y, width, height } = this.calculateImagePosition(
      pageWidth, pageHeight, margin, imageDataUrl, await this.loadImage(imageDataUrl)
    );

    // Add image to PDF
    const format = this.getImageFormat(imageDataUrl);
    pdf.addImage(imageDataUrl, format, x, y, width, height);

    // Add metadata
    if (metadata.name) {
      pdf.setProperties({
        title: metadata.name,
        subject: metadata.category || '',
        author: 'SmartScan',
        creator: 'SmartScan PWA',
        keywords: [metadata.category, metadata.sender].filter(Boolean).join(', ')
      });
    }

    // Return as blob
    return pdf.output('blob');
  }

  /**
   * Calculate image position on page with minimal margins
   * Top margin is prioritized (0.5cm) when aspect ratios differ
   * @param {number} pageWidth - Page width in mm
   * @param {number} pageHeight - Page height in mm
   * @param {number} margin - Desired margin in mm (0.5cm = 5mm)
   * @param {string} imageDataUrl - Image data URL
   * @param {HTMLImageElement} img - Loaded image element
   * @returns {Object} { x, y, width, height }
   */
  calculateImagePosition(pageWidth, pageHeight, margin, imageDataUrl, img) {
    const imgRatio = img.width / img.height;

    // Maximum available space with minimal margins
    const maxWidth = pageWidth - (margin * 2);
    const maxHeight = pageHeight - (margin * 2);
    const pageRatio = maxWidth / maxHeight;

    let imgWidth, imgHeight, x, y;

    if (imgRatio > pageRatio) {
      // Image is wider than page ratio - will have extra vertical space
      imgWidth = maxWidth;
      imgHeight = maxWidth / imgRatio;
      // Center horizontally, top-align vertically (top margin = 0.5cm)
      x = margin;
      y = margin; // Top-aligned
    } else {
      // Image is taller than page ratio - will have extra horizontal space
      imgHeight = maxHeight;
      imgWidth = maxHeight * imgRatio;
      // Center horizontally, use full vertical space
      x = margin + (maxWidth - imgWidth) / 2;
      y = margin;
    }

    return { x, y, width: imgWidth, height: imgHeight };
  }

  /**
   * Convert multiple images to a single PDF
   * @param {string[]} imageDataUrls - Array of image data URLs
   * @param {Object} metadata - Document metadata
   * @returns {Promise<Blob>} PDF as Blob
   */
  async convertMultiple(imageDataUrls, metadata = {}) {
    if (!this.jsPDF) {
      await this.init();
    }

    const pdf = new this.jsPDF({
      orientation: CONFIG.pdf.orientation,
      unit: 'mm',
      format: CONFIG.pdf.pageFormat
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = CONFIG.pdf.margin; // 5mm = 0.5cm

    for (let i = 0; i < imageDataUrls.length; i++) {
      if (i > 0) {
        pdf.addPage();
      }

      const imageDataUrl = imageDataUrls[i];
      const img = await this.loadImage(imageDataUrl);

      // Calculate image position with minimal margins, top-aligned
      const { x, y, width, height } = this.calculateImagePosition(
        pageWidth, pageHeight, margin, imageDataUrl, img
      );

      const format = this.getImageFormat(imageDataUrl);
      pdf.addImage(imageDataUrl, format, x, y, width, height);
    }

    // Add metadata
    if (metadata.name) {
      pdf.setProperties({
        title: metadata.name,
        subject: metadata.category || '',
        author: 'SmartScan',
        creator: 'SmartScan PWA'
      });
    }

    return pdf.output('blob');
  }

  /**
   * Load an image and return its dimensions
   * @param {string} dataUrl - Image data URL
   * @returns {Promise<HTMLImageElement>}
   */
  loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  /**
   * Get image format from data URL
   * @param {string} dataUrl
   * @returns {string}
   */
  getImageFormat(dataUrl) {
    if (dataUrl.includes('image/png')) return 'PNG';
    if (dataUrl.includes('image/gif')) return 'GIF';
    if (dataUrl.includes('image/webp')) return 'WEBP';
    return 'JPEG'; // Default
  }
}

// Export singleton instance
export const pdfConverter = new PDFConverter();
