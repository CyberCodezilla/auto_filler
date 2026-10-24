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

    // Remove hidden assistive math and raw script tags
    const toRemove = clone.querySelectorAll(
      '.MJX_Assistive_MathML, script[type="math/tex"], script[type^="math/"], .katex-mathml, annotation'
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
   * Extracts clean label text for an option, stripping radio/checkbox values or prefixes if needed
   */
  function cleanOptionLabel(container, inputEl) {
    if (!container) return '';

    const clone = container.cloneNode(true);
    // Remove the input element itself from text computation
    const inputs = clone.querySelectorAll('input, .MJX_Assistive_MathML, script');
    inputs.forEach(i => i.remove());

    let labelText = (clone.textContent || clone.innerText || '').trim();

    // Fallback to title or aria-label of input if container text is empty
    if (!labelText && inputEl) {
      labelText = inputEl.getAttribute('aria-label') || inputEl.getAttribute('title') || inputEl.value || '';
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

  const COURSEBUILDER_SELECTORS = [
    '.qt-mc-question',
    '.qt-sa-question',
    '.gcb-assessment-item',
    '.gcb-question',
    '.qt-question-block',
    'table.gcb-assessment-question',
    'div[id^="question_"]',
    'div[id^="qt_"]',
    '.assessment-question',
    '.quiz-question',
    '.assessment-item'
  ].join(', ');

  /**
   * Layer A: Scrapes Google Course Builder (.qt-*) structure used by NPTEL
   */
  function scrapeCourseBuilderQuestions(rootDoc = document) {
    const containers = Array.from(rootDoc.querySelectorAll(COURSEBUILDER_SELECTORS));
    if (containers.length === 0) return [];

    const questions = [];

    containers.forEach((container, index) => {
      const qId = `nptel-question-${index}`;
      container.setAttribute('data-formflow-id', qId);
      if (window.getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
      }

      // Prompt extraction
      const promptEl = container.querySelector('.qt-question, .qt-question-text, .gcb-question-title, .question-prompt, h2, h3, h4') || container;
      const title = cleanPromptText(promptEl) || `Question ${index + 1}`;

      // Extract all images in prompt
      const promptImages = Array.from(promptEl.querySelectorAll('img')).map(img => ({
        element: img,
        src: img.src || img.getAttribute('src'),
        alt: img.alt || ''
      }));

      // Detect input elements
      const radios = Array.from(container.querySelectorAll('.qt-choices input[type="radio"], input[type="radio"], [role="radio"]'));
      const checkboxes = Array.from(container.querySelectorAll('.qt-choices input[type="checkbox"], input[type="checkbox"], [role="checkbox"]'));
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
          const wrapper = radio.closest('.gcb-mcq-choice, label, li, div') || radio.parentElement;
          const label = cleanOptionLabel(wrapper, radio);
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
          const wrapper = cb.closest('.gcb-mcq-choice, label, li, div') || cb.parentElement;
          const label = cleanOptionLabel(wrapper, cb);
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
    cleanPromptText
  };
})();
