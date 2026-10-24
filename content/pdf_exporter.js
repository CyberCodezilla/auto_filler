/**
 * FormFlow - Flawless Zero-Glitch Quiz-to-PDF Exporter
 * Converts active assessments (NPTEL / SWAYAM / Google Forms) into a vector-sharp,
 * beautifully styled A4 print document with base64 image pre-hydration and anti-slice CSS.
 */

(function () {
  'use strict';

  window.FormFlow = window.FormFlow || {};

  /**
   * Converts an image to a base64 data URL
   * Tries canvas snapshot first, falls back to fetch blob
   */
  async function imageToBase64(imgEl) {
    if (!imgEl) return null;

    const rawSrc = imgEl.currentSrc || imgEl.src || imgEl.getAttribute('src');
    if (!rawSrc) return null;

    // Already a data URI
    if (rawSrc.startsWith('data:')) {
      return rawSrc;
    }

    // Resolve relative URL
    let absoluteUrl;
    try {
      absoluteUrl = new URL(rawSrc, window.location.href).href;
    } catch (e) {
      absoluteUrl = rawSrc;
    }

    // Attempt 1: If image is already rendered in DOM, draw to offscreen canvas
    try {
      if (imgEl.complete && imgEl.naturalWidth > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = imgEl.naturalWidth;
        canvas.height = imgEl.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgEl, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        if (dataUrl && dataUrl.length > 50) {
          return dataUrl;
        }
      }
    } catch (corsErr) {
      // Canvas tainted by cross-origin, fall through to fetch
    }

    // Attempt 2: Fetch image blob and read as Data URL
    try {
      const response = await fetch(absoluteUrl, { mode: 'cors' });
      if (response.ok) {
        const blob = await response.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => resolve(absoluteUrl);
          reader.readAsDataURL(blob);
        });
      }
    } catch (fetchErr) {
      // Fallback: return resolved absolute URL
    }

    return absoluteUrl;
  }

  /**
   * Sanitizes MathJax / KaTeX formulas in a cloned DOM element
   * Removes hidden screen-reader tags that cause duplicate text.
   */
  function sanitizeFormulas(clonedEl) {
    if (!clonedEl) return;
    const hiddenMath = clonedEl.querySelectorAll(
      '.MJX_Assistive_MathML, script[type="math/tex"], script[type^="math/"], .katex-mathml, annotation'
    );
    hiddenMath.forEach(node => node.remove());
  }

  /**
   * Clones and pre-hydrates all images in an element with base64 data URIs
   */
  async function hydrateClonedImages(clonedEl) {
    if (!clonedEl) return;
    const images = Array.from(clonedEl.querySelectorAll('img'));

    await Promise.all(images.map(async (img) => {
      const base64 = await imageToBase64(img);
      if (base64) {
        img.src = base64;
      }
      // Constrain styles for clean printing
      img.style.maxWidth = '100%';
      img.style.maxHeight = '280px';
      img.style.objectFit = 'contain';
      img.style.display = 'block';
      img.style.margin = '8px 0';
    }));
  }

  /**
   * Extracts page title
   */
  function extractQuizTitle() {
    const candidates = [
      document.querySelector('.gcb-unit-header, .unit-title')?.innerText,
      document.querySelector('h1')?.innerText,
      document.querySelector('.assessment-title, .quiz-title')?.innerText,
      document.title
    ];
    for (const c of candidates) {
      if (c && c.trim().length > 0) return c.trim();
    }
    return 'Assessment';
  }

  /**
   * Generates and triggers printing of the PDF document
   */
  async function exportQuizToPdf(options = {}) {
    const {
      highlightSelected = true,
      onProgress = null
    } = options;

    if (onProgress) onProgress('Harvesting assessment questions...');

    // Determine scraper: NPTEL or Google Forms
    let questions = [];
    if (window.FormFlow.NptelScraper) {
      questions = window.FormFlow.NptelScraper.scrapeNptelQuestions();
    }
    if (questions.length === 0 && window.FormFlow.Scraper) {
      questions = window.FormFlow.Scraper.scrapeFormQuestions();
    }

    if (questions.length === 0) {
      throw new Error('No assessment questions found on this page to export.');
    }

    const title = extractQuizTitle();
    const dateStr = new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    if (onProgress) onProgress(`Pre-hydrating diagrams and images across ${questions.length} questions...`);

    // Build question cards HTML
    const cardsHtml = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qNum = i + 1;

      // Clone question prompt
      const promptEl = q.promptElement || q.container.querySelector('[role="heading"], .qt-question, h1, h2, h3, h4, .prompt') || q.container;
      const promptClone = promptEl.cloneNode(true);
      sanitizeFormulas(promptClone);
      await hydrateClonedImages(promptClone);

      // Build options HTML
      let optionsHtml = '';

      if (q.type === 'radio' || q.type === 'checkbox') {
        const optionsList = q.options || [];
        const items = [];

        for (let j = 0; j < optionsList.length; j++) {
          const opt = optionsList[j];
          const isSelected = !!opt.isChecked;
          const letter = opt.letter || String.fromCharCode(65 + j);

          let optContent = opt.text;
          if (opt.wrapper) {
            const optClone = opt.wrapper.cloneNode(true);
            sanitizeFormulas(optClone);
            await hydrateClonedImages(optClone);
            optClone.querySelectorAll('input').forEach(inp => inp.remove());
            optContent = optClone.innerHTML.trim() || opt.text;
          }

          const selectedClass = (highlightSelected && isSelected) ? 'pdf-option selected' : 'pdf-option';
          const markerSymbol = q.type === 'radio' ? (isSelected && highlightSelected ? '◉' : '○') : (isSelected && highlightSelected ? '☑' : '☐');

          items.push(`
            <div class="${selectedClass}">
              <span class="pdf-option-marker">${markerSymbol}</span>
              <span class="pdf-option-letter">${letter}.</span>
              <span class="pdf-option-text">${optContent}</span>
            </div>
          `);
        }

        optionsHtml = `<div class="pdf-options-container">${items.join('')}</div>`;
      } else if (q.type === 'dropdown') {
        const selectedVal = q.currentValue || (q.selectElement ? q.selectElement.value : '');
        optionsHtml = `
          <div class="pdf-text-response">
            <span class="pdf-label">Dropdown Selection:</span>
            <span class="pdf-value">${selectedVal ? selectedVal : '<em>(Unanswered)</em>'}</span>
          </div>
        `;
      } else if (q.type === 'text' || q.type === 'number' || q.type === 'textarea') {
        const val = q.currentValue || (q.inputElement ? q.inputElement.value : '');
        optionsHtml = `
          <div class="pdf-text-response">
            <span class="pdf-label">Answer:</span>
            <span class="pdf-value ${val ? 'filled' : ''}">${val ? val : '________________________________________'}</span>
          </div>
        `;
      }

      cardsHtml.push(`
        <div class="pdf-question-card">
          <div class="pdf-question-header">
            <span class="pdf-question-badge">Q${qNum}</span>
            <div class="pdf-question-prompt">${promptClone.innerHTML}</div>
          </div>
          ${optionsHtml}
        </div>
      `);
    }

    if (onProgress) onProgress('Compiling print-optimized PDF document...');

    // Assemble self-contained print HTML document
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title} — Export</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm 14mm 14mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      color: #18181b;
      background: #ffffff;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .pdf-doc-header {
      border-bottom: 2px solid #e4e4e7;
      padding-bottom: 12px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .pdf-title-block h1 {
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 4px 0;
      color: #09090b;
    }
    .pdf-meta-block {
      font-size: 11px;
      color: #71717a;
      text-align: right;
    }
    .pdf-question-card {
      border: 1px solid #e4e4e7;
      border-radius: 6px;
      padding: 12px 14px;
      margin-bottom: 12px;
      background: #ffffff;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    .pdf-question-header {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      margin-bottom: 10px;
    }
    .pdf-question-badge {
      background: #f4f4f5;
      border: 1px solid #e4e4e7;
      color: #18181b;
      font-weight: 700;
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .pdf-question-prompt {
      flex: 1;
      font-size: 13.5px;
      font-weight: 500;
      color: #18181b;
      line-height: 1.45;
    }
    .pdf-question-prompt img, .pdf-question-card img {
      max-width: 100%;
      max-height: 280px;
      height: auto;
      object-fit: contain;
      display: block;
      margin: 8px 0;
      border-radius: 4px;
    }
    .pdf-options-container {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
      padding-left: 32px;
    }
    .pdf-option {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 6px 10px;
      border: 1px solid #f4f4f5;
      border-radius: 4px;
      background: #fafafa;
      font-size: 12.5px;
    }
    .pdf-option.selected {
      background: #ecfdf5 !important;
      border-color: #10b981 !important;
      color: #065f46 !important;
      font-weight: 600;
    }
    .pdf-option-marker {
      font-size: 13px;
      line-height: 1;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .pdf-option-letter {
      font-weight: 600;
      flex-shrink: 0;
    }
    .pdf-option-text {
      flex: 1;
    }
    .pdf-text-response {
      margin-top: 8px;
      padding-left: 32px;
      font-size: 12.5px;
    }
    .pdf-label {
      font-weight: 600;
      color: #52525b;
      margin-right: 6px;
    }
    .pdf-value.filled {
      font-weight: 600;
      color: #059669;
    }
    .pdf-footer {
      border-top: 1px solid #e4e4e7;
      padding-top: 8px;
      margin-top: 24px;
      font-size: 10px;
      color: #a1a1aa;
      display: flex;
      justify-content: space-between;
    }
    .no-print {
      display: block;
    }
    @media print {
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="no-print" style="position: sticky; top: 0; background: #09090b; color: white; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #27272a; margin-bottom: 16px; z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div style="font-size: 13px; font-weight: 600; color: #10b981;">✔ FormFlow Quiz Document Ready</div>
    <button onclick="window.print()" style="background: #10b981; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer;">🖨️ Print / Save as PDF</button>
  </div>

  <div class="pdf-doc-header">
    <div class="pdf-title-block">
      <h1>${title}</h1>
      <span style="font-size: 11px; color: #71717a;">Total Questions: ${questions.length}</span>
    </div>
    <div class="pdf-meta-block">
      <div>FormFlow Precision Assessment Export</div>
      <div>${dateStr}</div>
    </div>
  </div>

  <div class="pdf-cards-list">
    ${cardsHtml.join('')}
  </div>

  <div class="pdf-footer">
    <span>Exported via FormFlow — Precision Autofill</span>
    <span>Page 1 of Document</span>
  </div>

  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        try { window.print(); } catch (e) {}
      }, 400);
    });
  </script>
</body>
</html>`;

    // Convert document to a Blob URL to bypass iframe sandboxing and CSP restrictions
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    if (onProgress) onProgress('Ready! Launching system print dialog...');

    try {
      const printWindow = window.open(blobUrl, '_blank');
      if (!printWindow) {
        // Fallback to hidden iframe if popups blocked
        let printFrame = document.getElementById('formflow-print-frame');
        if (!printFrame) {
          printFrame = document.createElement('iframe');
          printFrame.id = 'formflow-print-frame';
          printFrame.style.position = 'fixed';
          printFrame.style.top = '-9999px';
          printFrame.style.left = '-9999px';
          printFrame.style.width = '0px';
          printFrame.style.height = '0px';
          printFrame.style.border = 'none';
          document.body.appendChild(printFrame);
        }
        printFrame.src = blobUrl;
      }
    } catch (e) {
      console.warn('[FormFlow] Could not open print window, falling back to iframe:', e);
      let printFrame = document.getElementById('formflow-print-frame');
      if (!printFrame) {
        printFrame = document.createElement('iframe');
        printFrame.id = 'formflow-print-frame';
        printFrame.style.position = 'fixed';
        printFrame.style.top = '-9999px';
        printFrame.style.left = '-9999px';
        printFrame.style.width = '0px';
        printFrame.style.height = '0px';
        printFrame.style.border = 'none';
        document.body.appendChild(printFrame);
      }
      printFrame.src = blobUrl;
    }

    return {
      success: true,
      questionCount: questions.length,
      title
    };
  }

  window.FormFlow.PdfExporter = {
    exportQuizToPdf,
    imageToBase64
  };
})();
