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
    const margin = CONFIG.pdf.margin;
    const maxWidth = pageWidth - (margin * 2);
    const maxHeight = pageHeight - (margin * 2);

    // Load image to get dimensions
    const img = await this.loadImage(imageDataUrl);
    const imgRatio = img.width / img.height;
    const pageRatio = maxWidth / maxHeight;

    let imgWidth, imgHeight;

    if (imgRatio > pageRatio) {
      // Image is wider than page
      imgWidth = maxWidth;
      imgHeight = maxWidth / imgRatio;
    } else {
      // Image is taller than page
      imgHeight = maxHeight;
      imgWidth = maxHeight * imgRatio;
    }

    // Center image on page
    const x = margin + (maxWidth - imgWidth) / 2;
    const y = margin + (maxHeight - imgHeight) / 2;

    // Add image to PDF
    const format = this.getImageFormat(imageDataUrl);
    pdf.addImage(imageDataUrl, format, x, y, imgWidth, imgHeight);

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
    const margin = CONFIG.pdf.margin;
    const maxWidth = pageWidth - (margin * 2);
    const maxHeight = pageHeight - (margin * 2);

    for (let i = 0; i < imageDataUrls.length; i++) {
      if (i > 0) {
        pdf.addPage();
      }

      const imageDataUrl = imageDataUrls[i];
      const img = await this.loadImage(imageDataUrl);
      const imgRatio = img.width / img.height;
      const pageRatio = maxWidth / maxHeight;

      let imgWidth, imgHeight;

      if (imgRatio > pageRatio) {
        imgWidth = maxWidth;
        imgHeight = maxWidth / imgRatio;
      } else {
        imgHeight = maxHeight;
        imgWidth = maxHeight * imgRatio;
      }

      const x = margin + (maxWidth - imgWidth) / 2;
      const y = margin + (maxHeight - imgHeight) / 2;

      const format = this.getImageFormat(imageDataUrl);
      pdf.addImage(imageDataUrl, format, x, y, imgWidth, imgHeight);
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
