/**
 * FormFlow - Dual-Layer NPTEL / SWAYAM DOM Scraper
 * Identifies NPTEL and CourseBuilder assessment questions across all 4 field types:
 * Radio (single choice), Checkboxes (multi-select), Dropdowns (<select>), and Text/Numerical inputs.
 * Supports both CourseBuilder (.qt-*) and Structural Fallback layouts.
 */

(function () {
  'use strict';

  window.FormFlow = window.FormFlow || {};

  /**
   * Detects if the current frame or window is an NPTEL or SWAYAM assessment
   */
  function isNptelPage() {
    const host = window.location.hostname.toLowerCase();
    if (host.includes('nptel.ac.in') || host.includes('swayam.gov.in')) {
      return true;
    }
    // Also check for signature CourseBuilder or SWAYAM assessment elements
    return !!(
      document.querySelector('.qt-mc-question, .qt-sa-question, .gcb-assessment-item, iframe.gcb-assessment, form#assessment-form, .unit-content')
    );
  }

  /**
   * Helper to clean question prompt text while preserving math formulas cleanly
   * Strips accessibility/assistive tags that produce duplicate text in MathJax/KaTeX.
   */
  function cleanPromptText(element) {
    if (!element) return '';

    const clone = element.cloneNode(true);

    // Remove hidden assistive math, raw script tags, inputs, and option labels
    const toRemove = clone.querySelectorAll(
      '.MJX_Assistive_MathML, script[type="math/tex"], script[type^="math/"], .katex-mathml, annotation, .qt-choices, .option-lbl, .option-row, .option-item, .options, input, select, textarea, button'
    );
    toRemove.forEach(node => node.remove());

    // Replace <br> and paragraph endings with newlines
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    clone.querySelectorAll('p, div').forEach(block => {
      block.insertAdjacentText('afterend', '\n');
    });

    let text = clone.textContent || clone.innerText || '';
    // Normalize consecutive whitespace
    text = text.replace(/[ \t\r\f]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
    return text;
  }

  /**
   * Extracts clean label text for an option, stripping radio/checkbox values or prefixes
   */
  function cleanOptionLabel(container, inputEl) {
    if (!container && !inputEl) return '';

    let labelText = '';

    // 1. If inputEl has an ID, look for matching <label for="inputId">
    if (inputEl && inputEl.id) {
      const doc = inputEl.ownerDocument || document;
      try {
        const forLabel = doc.querySelector(`label[for="${CSS.escape(inputEl.id)}"]`);
        if (forLabel) {
          const clone = forLabel.cloneNode(true);
          clone.querySelectorAll('input, .MJX_Assistive_MathML, script').forEach(n => n.remove());
          labelText = (clone.textContent || clone.innerText || '').trim();
        }
      } catch (e) {}
    }

    // 2. Check inputEl.closest('label')
    if (!labelText && inputEl) {
      const parentLabel = inputEl.closest('label');
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true);
        clone.querySelectorAll('input, .MJX_Assistive_MathML, script').forEach(n => n.remove());
        labelText = (clone.textContent || clone.innerText || '').trim();
      }
    }

    // 3. Check adjacent sibling elements (e.g. <input><label>Text</label> or <input><span>Text</span>)
    if (!labelText && inputEl) {
      let sib = inputEl.nextElementSibling;
      while (sib) {
        if (sib.matches('label, span, div, p, .option-lbl, .gcb-mcq-choice, td')) {
          const clone = sib.cloneNode(true);
          clone.querySelectorAll('input, .MJX_Assistive_MathML, script').forEach(n => n.remove());
          const text = (clone.textContent || clone.innerText || '').trim();
          if (text.length > 0) {
            labelText = text;
            break;
          }
        }
        sib = sib.nextElementSibling;
      }
    }

    // 4. Check if input is inside a table cell <td>, then check adjacent <td>
    if (!labelText && inputEl && inputEl.closest('td')) {
      const td = inputEl.closest('td');
      const nextTd = td.nextElementSibling;
      if (nextTd) {
        const clone = nextTd.cloneNode(true);
        clone.querySelectorAll('input, .MJX_Assistive_MathML, script').forEach(n => n.remove());
        labelText = (clone.textContent || clone.innerText || '').trim();
      }
    }

    // 5. Check if input has a parent choice row (e.g. .gcb-mcq-choice, .option-row, tr, li)
    if (!labelText && inputEl) {
      const row = inputEl.closest('.gcb-mcq-choice, .option-row, .option-item, li, tr');
      if (row) {
        const clone = row.cloneNode(true);
        clone.querySelectorAll('input, .MJX_Assistive_MathML, script').forEach(n => n.remove());
        labelText = (clone.textContent || clone.innerText || '').trim();
      }
    }

    // 6. Check container text with inputs stripped
    if (!labelText && container) {
      const clone = container.cloneNode(true);
      clone.querySelectorAll('input, .MJX_Assistive_MathML, script').forEach(n => n.remove());
      labelText = (clone.textContent || clone.innerText || '').trim();
    }

    // 7. Check aria-label or title of input
    if (!labelText && inputEl) {
      labelText = inputEl.getAttribute('aria-label') || inputEl.getAttribute('title') || '';
    }

    // Guard: If labelText is "on" (case-insensitive), it is the HTML default checkbox value, NOT label text!
    if (labelText.toLowerCase() === 'on') {
      labelText = '';
    }

    // Guard: Only use input.value if it's NOT "on" and not a pure integer index like "0", "1"
    if (!labelText && inputEl && inputEl.value && inputEl.value.toLowerCase() !== 'on' && !/^\d+$/.test(inputEl.value.trim())) {
      labelText = inputEl.value.trim();
    }

    return labelText.trim();
  }

  /**
   * Returns all documents accessible from current context
   * (the main document and any same-origin iframe contentDocuments)
   */
  function getCandidateDocs() {
    const docs = [document];
    try {
      const iframes = Array.from(document.querySelectorAll('iframe'));
      for (const iframe of iframes) {
        try {
          if (iframe.contentDocument && iframe.contentDocument.body) {
            docs.push(iframe.contentDocument);
          }
        } catch (e) {
          // Cross-origin iframe (handled natively via all_frames: true)
        }
      }
    } catch (e) {}
    return docs;
  }

  /**
   * Extracts the assignment preamble/instructions header that often contains
   * the shared problem statement, rules, formulas, and main diagrams (e.g. the AND-OR graph).
   */
  function extractAssignmentPreamble(rootDoc = document) {
    const candidates = [
      rootDoc.querySelector('.gcb-assessment-description'),
      rootDoc.querySelector('.assessment-description'),
      rootDoc.querySelector('.gcb-assessment-instructions'),
      rootDoc.querySelector('.assessment-instructions'),
      rootDoc.querySelector('.assignment-description'),
      rootDoc.querySelector('.gcb-lesson-content > div:first-child'),
      rootDoc.querySelector('.unit-content > div:first-child'),
      rootDoc.querySelector('#assessment-form > div:first-child'),
      rootDoc.querySelector('form#assessment-form > .gcb-border-box:first-of-type'),
      rootDoc.querySelector('.assessment-header-instructions'),
      rootDoc.querySelector('.instructions')
    ].filter(Boolean);

    for (const c of candidates) {
      if ((c.textContent.trim().length > 25 || c.querySelector('img')) &&
          !c.querySelector('input[type="radio"], input[type="checkbox"], .qt-choices')) {
        return c;
      }
    }

    // Fallback: Check any element in the container preceding the first question
    const firstQ = rootDoc.querySelector('.qt-mc-question, .qt-sa-question, table.gcb-assessment-question, .question-row');
    if (firstQ && firstQ.parentElement) {
      const parent = firstQ.parentElement;
      for (const child of Array.from(parent.children)) {
        if (child === firstQ) break;
        if ((child.textContent.trim().length > 25 || child.querySelector('img')) &&
            !child.querySelector('input[type="radio"], input[type="checkbox"], input[type="text"]')) {
          return child;
        }
      }
    }

    return null;
  }

  /**
   * Extracts the true question prompt element inside a question container
   */
  function extractPromptElement(container) {
    if (!container) return null;

    const promptSelectors = [
      '.qt-question-text',
      '.qt-question',
      '.gcb-question-text',
      'td.gcb-question-text',
      '.gcb-question-title',
      '.question-_viewer',
      '[class*="question-_viewer"]',
      '.question-text',
      '[class*="question-text"]',
      '.question-statement',
      '[class*="question-statement"]',
      '.question-prompt',
      '.prompt',
      'tr.gcb-question-row'
    ];

    for (const sel of promptSelectors) {
      const el = container.querySelector(sel);
      if (el && (cleanPromptText(el).length > 0 || el.querySelector('img'))) {
        return el;
      }
    }

    // If container is a table, check first row
    if (container.tagName && container.tagName.toLowerCase() === 'table') {
      const firstRow = container.querySelector('tr');
      if (firstRow) return firstRow;
    }

    return null;
  }

  const COURSEBUILDER_SELECTORS = [
    '.question-row',
    'div.question-row',
    '[class*="question-row"]',
    '.qt-mc-question',
    '.qt-sa-question',
    '.gcb-assessment-item',
    '.gcb-question',
    '.qt-question-block',
    'table.gcb-assessment-question',
    'div[id^="question_"]',
    'div[id^="question-"]',
    '.assessment-question',
    '.quiz-question',
    '.assessment-item',
    '[class*="assessment-question"]',
    '[class*="assessment-item"]',
    '[class*="question-container"]',
    '[class*="question-_viewer"]',
    '.gcb-border-box',
    '.gcb-assessment-contents',
    'div.unit-content div[class*="question"]'
  ].join(', ');

  /**
   * Layer A: Scrapes Google Course Builder (.qt-*) and modern NPTEL (.question-row) structures
   */
  function scrapeCourseBuilderQuestions(rootDoc = document) {
    const containers = Array.from(rootDoc.querySelectorAll(COURSEBUILDER_SELECTORS)).filter(el => {
      // Must contain at least one real question input
      return !!el.querySelector('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], select, input[type="text"], input[type="number"], textarea');
    });

    if (containers.length === 0) return [];

    const questions = [];

    containers.forEach((container, index) => {
      const qId = `nptel-question-${index}`;
      container.setAttribute('data-formflow-id', qId);
      if (window.getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
      }

      // Prompt extraction
      const promptEl = extractPromptElement(container) || container;
      const title = cleanPromptText(promptEl) || `Question ${index + 1}`;

      // Extract all images in container (diagrams, math formulas, circuits)
      const promptImages = Array.from(container.querySelectorAll('img')).filter(img => {
        const src = (img.src || img.getAttribute('src') || '').toLowerCase();
        return !src.includes('check') && !src.includes('cross') && !src.includes('icon');
      }).map(img => ({
        element: img,
        src: img.src || img.getAttribute('src'),
        alt: img.alt || ''
      }));

      // Detect input elements
      const radios = Array.from(container.querySelectorAll(
        '.qt-choices input[type="radio"], input[type="radio"], [role="radio"]'
      ));
      const checkboxes = Array.from(container.querySelectorAll(
        '.qt-choices input[type="checkbox"], input[type="checkbox"], [role="checkbox"]'
      ));
      const select = container.querySelector('.qt-response select, select');
      const textInput = container.querySelector(
        '.qt-response input[type="text"], .qt-response input[type="number"], .qt-response textarea, input[type="text"], input[type="number"], textarea'
      );

      let type = 'unknown';
      let options = [];
      let inputElement = null;

      if (radios.length > 0) {
        type = 'radio';
        options = radios.map((radio, optIdx) => {
          const wrapper = radio.closest('.gcb-mcq-choice, .option-row, .option-item, .choice, label, li, div') || radio.parentElement;
          let label = '';
          if (radio.id) {
            const forLabel = container.querySelector(`label[for="${radio.id}"]`);
            if (forLabel) label = cleanOptionLabel(forLabel, radio);
          }
          if (!label) {
            const optLbl = wrapper ? wrapper.querySelector('.option-lbl, label') : null;
            if (optLbl) label = cleanOptionLabel(optLbl, radio);
          }
          if (!label) {
            label = cleanOptionLabel(wrapper, radio);
          }

          const letter = String.fromCharCode(65 + optIdx); // 'A', 'B', 'C'...
          return {
            index: optIdx,
            letter,
            text: label || `${letter}`,
            value: radio.value || `${optIdx}`,
            element: radio,
            wrapper: wrapper,
            isChecked: radio.checked
          };
        });
      } else if (checkboxes.length > 0) {
        type = 'checkbox';
        options = checkboxes.map((cb, optIdx) => {
          const wrapper = cb.closest('.gcb-mcq-choice, .option-row, .option-item, .choice, label, li, div') || cb.parentElement;
          let label = '';
          if (cb.id) {
            const forLabel = container.querySelector(`label[for="${cb.id}"]`);
            if (forLabel) label = cleanOptionLabel(forLabel, cb);
          }
          if (!label) {
            const optLbl = wrapper ? wrapper.querySelector('.option-lbl, label') : null;
            if (optLbl) label = cleanOptionLabel(optLbl, cb);
          }
          if (!label) {
            label = cleanOptionLabel(wrapper, cb);
          }

          const letter = String.fromCharCode(65 + optIdx);
          return {
            index: optIdx,
            letter,
            text: label || `${letter}`,
            value: cb.value || `${optIdx}`,
            element: cb,
            wrapper: wrapper,
            isChecked: cb.checked
          };
        });
      } else if (select) {
        type = 'dropdown';
        options = Array.from(select.options)
          .filter(opt => {
            const val = opt.value.trim().toLowerCase();
            return val !== '' && val !== 'choose' && val !== 'select' && !opt.disabled;
          })
          .map((opt, optIdx) => ({
            index: optIdx,
            text: opt.text.trim(),
            value: opt.value,
            element: opt,
            isSelected: opt.selected
          }));
        inputElement = select;
      } else if (textInput) {
        type = textInput.type === 'number' ? 'number' : (textInput.tagName.toLowerCase() === 'textarea' ? 'textarea' : 'text');
        inputElement = textInput;
      }

      // Compute current value
      let isAlreadyFilled = false;
      let currentValue = '';

      if (type === 'radio') {
        const checked = options.find(o => o.isChecked);
        isAlreadyFilled = !!checked;
        currentValue = checked ? checked.text : '';
      } else if (type === 'checkbox') {
        const checkedList = options.filter(o => o.isChecked);
        isAlreadyFilled = checkedList.length > 0;
        currentValue = checkedList.map(o => o.text).join('; ');
      } else if (type === 'dropdown') {
        if (select && select.selectedIndex > 0) {
          const selOpt = select.options[select.selectedIndex];
          if (selOpt && selOpt.value) {
            isAlreadyFilled = true;
            currentValue = selOpt.text.trim();
          }
        }
      } else if (inputElement) {
        const val = (inputElement.value || '').trim();
        isAlreadyFilled = val.length > 0;
        currentValue = val;
      }

      if (type !== 'unknown') {
        questions.push({
          id: qId,
          index,
          title,
          type,
          options,
          inputElement,
          selectElement: select,
          container,
          promptElement: promptEl,
          promptImages,
          isNptel: true,
          isAlreadyFilled,
          currentValue
        });
      }
    });

    return questions;
  }

  /**
   * Layer B: Structural DOM fallback for modernized or custom LMS layouts
   */
  function scrapeStructuralFallbackQuestions(rootDoc = document) {
    // Find all radio/checkbox groups, selects, or text inputs
    const allInputs = Array.from(rootDoc.querySelectorAll(
      'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], select, input[type="text"], input[type="number"], textarea'
    ));
    if (allInputs.length === 0) return [];

    const groupedQuestions = new Map();

    allInputs.forEach(input => {
      // Find nearest question container
      const container = input.closest('.question, .assessment-item, .card, fieldset, tr, li, .form-group, div[class*="question"], div[id*="question"]') || input.parentElement;
      const name = input.name || `unnamed-${Math.random()}`;
      const groupKey = (input.type === 'radio' || input.type === 'checkbox') ? `${input.type}-${name}` : `field-${Math.random()}`;

      if (!groupedQuestions.has(groupKey)) {
        groupedQuestions.set(groupKey, {
          container,
          type: input.type === 'radio' ? 'radio' : (input.type === 'checkbox' ? 'checkbox' : (input.tagName.toLowerCase() === 'select' ? 'dropdown' : 'text')),
          inputs: [],
          select: input.tagName.toLowerCase() === 'select' ? input : null
        });
      }
      groupedQuestions.get(groupKey).inputs.push(input);
    });

    const questions = [];
    let index = 0;

    groupedQuestions.forEach(group => {
      const qId = `nptel-fallback-q-${index}`;
      group.container.setAttribute('data-formflow-id', qId);
      if (window.getComputedStyle(group.container).position === 'static') {
        group.container.style.position = 'relative';
      }

      const promptEl = group.container.querySelector('h1, h2, h3, h4, h5, .question-text, .prompt, legend') || group.container;
      const title = cleanPromptText(promptEl) || `Question ${index + 1}`;

      const promptImages = Array.from(promptEl.querySelectorAll('img')).map(img => ({
        element: img,
        src: img.src || img.getAttribute('src'),
        alt: img.alt || ''
      }));

      let options = [];
      let inputElement = null;

      if (group.type === 'radio' || group.type === 'checkbox') {
        options = group.inputs.map((inp, optIdx) => {
          const wrapper = inp.closest('label, li, div') || inp.parentElement;
          const letter = String.fromCharCode(65 + optIdx);
          const label = cleanOptionLabel(wrapper, inp);
          return {
            index: optIdx,
            letter,
            text: label || `${letter}`,
            value: inp.value || `${optIdx}`,
            element: inp,
            wrapper,
            isChecked: inp.checked
          };
        });
      } else if (group.type === 'dropdown') {
        inputElement = group.select;
        if (group.select) {
          options = Array.from(group.select.options)
            .filter(o => o.value && o.value !== 'choose' && o.value !== 'select')
            .map((o, optIdx) => ({
              index: optIdx,
              text: o.text.trim(),
              value: o.value,
              element: o,
              isSelected: o.selected
            }));
        }
      } else {
        inputElement = group.inputs[0];
      }

      let isAlreadyFilled = false;
      let currentValue = '';

      if (group.type === 'radio') {
        const checked = options.find(o => o.isChecked);
        isAlreadyFilled = !!checked;
        currentValue = checked ? checked.text : '';
      } else if (group.type === 'checkbox') {
        const checkedList = options.filter(o => o.isChecked);
        isAlreadyFilled = checkedList.length > 0;
        currentValue = checkedList.map(o => o.text).join('; ');
      } else if (inputElement) {
        currentValue = (inputElement.value || '').trim();
        isAlreadyFilled = currentValue.length > 0;
      }

      questions.push({
        id: qId,
        index,
        title,
        type: group.type,
        options,
        inputElement,
        selectElement: group.select,
        container: group.container,
        promptElement: promptEl,
        promptImages,
        isNptel: true,
        isAlreadyFilled,
        currentValue
      });

      index++;
    });

    return questions;
  }

  /**
   * Main entry point: Dual-layer scraper searching across all candidate documents
   */
  function scrapeNptelQuestions() {
    const docs = getCandidateDocs();

    for (const doc of docs) {
      // Layer A: CourseBuilder classes
      let questions = scrapeCourseBuilderQuestions(doc);

      // Layer B: Structural DOM fallback if Layer A returns empty
      if (!questions || questions.length === 0) {
        questions = scrapeStructuralFallbackQuestions(doc);
      }

      if (questions && questions.length > 0) {
        return questions;
      }
    }

    return [];
  }

  window.FormFlow.NptelScraper = {
    isNptelPage,
    scrapeNptelQuestions,
    cleanPromptText,
    extractAssignmentPreamble,
    extractPromptElement
  };
})();
