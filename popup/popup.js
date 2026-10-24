/**
 * FormFlow - Popup Controller Logic
 * Utilitarian interface manager, 3-tab coordinator (Fill, Profile, Audit),
 * Student Profile state manager, runtime dispatcher, and audit reporter.
 */

(function () {
  'use strict';

  // Sample 10 answers from PRD specification
  const PRD_SAMPLE_ANSWERS = [
    'Radio frequency band',
    'To carry the signal from transmitter to receiver',
    'Increased spectrum efficiency',
    'Network name',
    'It generally decreases',
    '2.4 GHz',
    'Bluetooth',
    'Reduction in signal power during propagation',
    'RSSI',
    'Transferring an ongoing connection from one cell to another'
  ].join('\n');

  // DOM Elements - Navigation & Header
  const connectionBadge = document.getElementById('connectionBadge');
  const connectionText = document.getElementById('connectionText');
  const tabInputBtn = document.getElementById('tabInputBtn');
  const tabNptelBtn = document.getElementById('tabNptelBtn');
  const tabProfileBtn = document.getElementById('tabProfileBtn');
  const tabReportBtn = document.getElementById('tabReportBtn');
  const nptelDetectedBadge = document.getElementById('nptelDetectedBadge');
  const reportCountBadge = document.getElementById('reportCountBadge');
  const viewInput = document.getElementById('viewInput');
  const viewNptel = document.getElementById('viewNptel');
  const viewProfile = document.getElementById('viewProfile');
  const viewReport = document.getElementById('viewReport');

  // DOM Elements - Fill Tab
  const profileOnboardingBanner = document.getElementById('profileOnboardingBanner');
  const bannerSetupBtn = document.getElementById('bannerSetupBtn');
  const rawInput = document.getElementById('rawInput');
  const linesCounter = document.getElementById('linesCounter');
  const skipFilledCheck = document.getElementById('skipFilledCheck');
  const loadExampleBtn = document.getElementById('loadExampleBtn');
  const clearInputBtn = document.getElementById('clearInputBtn');
  const executeBtn = document.getElementById('executeBtn');
  const executeBtnLabel = document.getElementById('executeBtnLabel');
  const btnSpinner = document.getElementById('btnSpinner');
  const pageAlert = document.getElementById('pageAlert');
  const shortcutKbd = document.getElementById('shortcutKbd');

  // DOM Elements - NPTEL Tab
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const exportPdfBtnLabel = document.getElementById('exportPdfBtnLabel');
  const pdfBtnSpinner = document.getElementById('pdfBtnSpinner');
  const highlightPdfCheck = document.getElementById('highlightPdfCheck');
  const pdfStatusBanner = document.getElementById('pdfStatusBanner');
  const pdfStatusText = document.getElementById('pdfStatusText');
  const nptelRawInput = document.getElementById('nptelRawInput');
  const nptelLinesCounter = document.getElementById('nptelLinesCounter');
  const clearNptelInputBtn = document.getElementById('clearNptelInputBtn');
  const nptelExecuteBtn = document.getElementById('nptelExecuteBtn');
  const nptelExecuteBtnLabel = document.getElementById('nptelExecuteBtnLabel');
  const nptelBtnSpinner = document.getElementById('nptelBtnSpinner');
  const nptelPageAlert = document.getElementById('nptelPageAlert');

  // DOM Elements - Profile Tab
  const profFullName = document.getElementById('profFullName');
  const profRollNo = document.getElementById('profRollNo');
  const profStudentId = document.getElementById('profStudentId');
  const profEmail = document.getElementById('profEmail');
  const profYearClass = document.getElementById('profYearClass');
  const profDivision = document.getElementById('profDivision');
  const profBranch = document.getElementById('profBranch');
  const profPhone = document.getElementById('profPhone');
  const autoFillOnLoadCheck = document.getElementById('autoFillOnLoadCheck');
  const saveProfileBtn = document.getElementById('saveProfileBtn');
  const fillProfileNowBtn = document.getElementById('fillProfileNowBtn');
  const profileAlert = document.getElementById('profileAlert');

  // DOM Elements - Audit Report Tab
  const reportEmptyState = document.getElementById('reportEmptyState');
  const reportSummaryCard = document.getElementById('reportSummaryCard');
  const auditListContainer = document.getElementById('auditListContainer');
  const auditItemsList = document.getElementById('auditItemsList');
  const reportActionsBar = document.getElementById('reportActionsBar');
  const goToInputBtn = document.getElementById('goToInputBtn');
  const undoBtn = document.getElementById('undoBtn');
  const exportLogBtn = document.getElementById('exportLogBtn');

  const summaryScore = document.getElementById('summaryScore');
  const summaryPercent = document.getElementById('summaryPercent');
  const summaryProgressFill = document.getElementById('summaryProgressFill');
  const chipProfile = document.getElementById('chipProfile');
  const chipExact = document.getElementById('chipExact');
  const chipFuzzy = document.getElementById('chipFuzzy');
  const chipPrefilled = document.getElementById('chipPrefilled');
  const chipUnmatched = document.getElementById('chipUnmatched');
  const chipSkipped = document.getElementById('chipSkipped');

  let activeTabId = null;
  let activeFrameId = null;
  let activeTabIsForm = false;
  let latestAuditData = null;

  // Detect platform for shortcut hint (Cmd vs Ctrl)
  if (navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0) {
    shortcutKbd.textContent = '⌘+Enter';
  }

  // --- INITIALIZATION ---
  init();

  async function init() {
    setupTabNavigation();
    setupEventListeners();
    await checkActiveTabConnection();
    await loadStoredData();
    updateLineCount();
    checkProfileOnboardingStatus();
  }

  /**
   * Ensures all FormFlow content scripts are active in the target tab across all frames.
   * This is critical if the page was opened before the extension was loaded or updated.
   */
  async function ensureContentScriptsInjected(tabId) {
    if (!chrome.scripting || !chrome.scripting.executeScript) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: [
          'content/parser.js',
          'content/identity.js',
          'content/matcher.js',
          'content/scraper.js',
          'content/nptel_scraper.js',
          'content/pdf_exporter.js',
          'content/filler.js',
          'content/content.js'
        ]
      });
    } catch (e) {
      // Content scripts already present or restricted tab
    }
  }

  /**
   * Probes all frames in the tab to locate the frame containing the assessment DOM
   * (e.g. NPTEL / SWAYAM embedded CourseBuilder iframe vs Google Forms top frame)
   */
  async function resolveActiveAssessmentFrame(tabId) {
    if (!chrome.scripting || !chrome.scripting.executeScript) {
      return null;
    }
    try {
      const frameResults = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => {
          if (window.FormFlow && window.FormFlow.NptelScraper) {
            const qs = window.FormFlow.NptelScraper.scrapeNptelQuestions();
            if (qs && qs.length > 0) {
              return { isNptel: true, count: qs.length };
            }
          }
          if (window.FormFlow && window.FormFlow.Scraper) {
            const qs = window.FormFlow.Scraper.scrapeFormQuestions();
            if (qs && qs.length > 0) {
              return { isForm: true, count: qs.length };
            }
          }
          return null;
        }
      });

      if (Array.isArray(frameResults)) {
        // Find frame that returned valid question count
        const match = frameResults.find(r => r.result && r.result.count > 0);
        if (match && typeof match.frameId === 'number') {
          return match.frameId;
        }
      }
    } catch (e) {
      console.warn('[FormFlow] Frame probe error:', e);
    }
    return null;
  }

  /**
   * Centralized tab message sender targeting the correct assessment frame
   */
  function sendToActiveTab(message, callback) {
    if (!activeTabId) return;
    const options = (typeof activeFrameId === 'number') ? { frameId: activeFrameId } : {};
    chrome.tabs.sendMessage(activeTabId, message, options, callback);
  }

  /**
   * Checks if active tab has a form and listens for FormFlow content script
   */
  async function checkActiveTabConnection() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        setConnectionState(false, 'No active tab');
        return;
      }

      activeTabId = tab.id;

      // Ensure content scripts are active before querying
      await ensureContentScriptsInjected(activeTabId);
      activeFrameId = await resolveActiveAssessmentFrame(activeTabId);

      const queryInfo = (cb) => {
        sendToActiveTab({ action: 'GET_FORM_INFO' }, cb);
      };

      const handleResponse = (response) => {
        if (chrome.runtime.lastError || !response) {
          setConnectionState(false, 'Not connected');
          showAlert('Please open a Google Form or NPTEL course page.', 'warning');
          activeTabIsForm = false;
        } else if (response.isForm) {
          activeTabIsForm = true;
          hideAlert();

          if (response.isNptel) {
            // Auto switch to NPTEL Tab
            switchTab('nptel');
            setConnectionState(true, `NPTEL (${response.questionCount} Qs)`);
            if (nptelDetectedBadge) {
              nptelDetectedBadge.textContent = response.questionCount;
              nptelDetectedBadge.classList.remove('hidden');
            }
            if (response.nptelMenu) {
              updateNptelMenuUI(response.nptelMenu);
            }
          } else {
            let statusText = `Connected (${response.questionCount} Qs`;
            if (response.identityCount > 0) {
              statusText += ` • ${response.identityCount} Profile`;
            }
            if (response.prefilledCount > 0) {
              statusText += ` • ${response.prefilledCount} Filled`;
            }
            statusText += ')';

            setConnectionState(true, statusText);
          }
        } else if (response.isNptel && response.nptelMenu) {
          // On NPTEL course page, but currently viewing a lecture/document (0 quiz questions on current view)
          switchTab('nptel');
          setConnectionState(true, 'NPTEL Course');
          updateNptelMenuUI(response.nptelMenu);
          activeTabIsForm = false;
          hideAlert();
        } else {
          setConnectionState(false, 'No questions found');
          showAlert('Page open, but 0 questions detected.', 'warning');
          activeTabIsForm = false;
        }
      };

      queryInfo(async (firstRes) => {
        if (!firstRes || !firstRes.isForm) {
          // If first probe found 0 questions (SPA still hydrating), retry once after 400ms
          setTimeout(async () => {
            activeFrameId = await resolveActiveAssessmentFrame(activeTabId);
            queryInfo(handleResponse);
          }, 400);
        } else {
          handleResponse(firstRes);
        }
      });
    } catch (e) {
      setConnectionState(false, 'Connection error');
    }
  }

  function setConnectionState(isConnected, text) {
    connectionText.textContent = text;
    if (isConnected) {
      connectionBadge.className = 'header-status connected';
    } else {
      connectionBadge.className = 'header-status warning';
    }
  }

  /**
   * Sets up 4-Tab switching
   */
  function setupTabNavigation() {
    tabInputBtn.addEventListener('click', () => switchTab('input'));
    if (tabNptelBtn) {
      tabNptelBtn.addEventListener('click', () => switchTab('nptel'));
    }
    tabProfileBtn.addEventListener('click', () => switchTab('profile'));
    tabReportBtn.addEventListener('click', () => switchTab('report'));
    goToInputBtn.addEventListener('click', () => switchTab('input'));

    if (bannerSetupBtn) {
      bannerSetupBtn.addEventListener('click', () => switchTab('profile'));
    }
  }

  function switchTab(tabName) {
    [tabInputBtn, tabNptelBtn, tabProfileBtn, tabReportBtn].forEach(btn => btn?.classList.remove('active'));
    [viewInput, viewNptel, viewProfile, viewReport].forEach(view => view?.classList.remove('active'));

    if (tabName === 'input') {
      tabInputBtn?.classList.add('active');
      viewInput?.classList.add('active');
    } else if (tabName === 'nptel') {
      tabNptelBtn?.classList.add('active');
      viewNptel?.classList.add('active');
      nptelRawInput?.focus();
    } else if (tabName === 'profile') {
      tabProfileBtn?.classList.add('active');
      viewProfile?.classList.add('active');
      profFullName?.focus();
    } else if (tabName === 'report') {
      tabReportBtn?.classList.add('active');
      viewReport?.classList.add('active');
    }
  }

  /**
   * Event Listeners for Editor, Profile & Actions
   */
  function setupEventListeners() {
    // Live line count on Google Forms input
    rawInput.addEventListener('input', () => {
      updateLineCount();
      saveInputState();
    });

    // Live line count on NPTEL input
    if (nptelRawInput) {
      nptelRawInput.addEventListener('input', () => {
        updateNptelLineCount();
        saveNptelInputState();
      });
    }

    // Keyboard shortcut (Ctrl/Cmd + Enter)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (viewNptel && viewNptel.classList.contains('active')) {
          triggerNptelFill();
        } else {
          triggerAutofill();
        }
      }
    });

    // Settings checkboxes
    if (skipFilledCheck) {
      skipFilledCheck.addEventListener('change', () => {
        try {
          chrome.storage.local.set({ formflow_skip_filled: skipFilledCheck.checked });
        } catch (e) {}
      });
    }

    // Fill Action buttons
    executeBtn.addEventListener('click', triggerAutofill);

    loadExampleBtn.addEventListener('click', () => {
      rawInput.value = PRD_SAMPLE_ANSWERS;
      updateLineCount();
      saveInputState();
      rawInput.focus();
    });

    clearInputBtn.addEventListener('click', () => {
      rawInput.value = '';
      updateLineCount();
      saveInputState();
    });

    // NPTEL tab action buttons
    if (clearNptelInputBtn) {
      clearNptelInputBtn.addEventListener('click', () => {
        if (nptelRawInput) {
          nptelRawInput.value = '';
          updateNptelLineCount();
          saveNptelInputState();
        }
      });
    }

    if (exportPdfBtn) {
      exportPdfBtn.addEventListener('click', triggerExportPdf);
    }

    if (nptelExecuteBtn) {
      nptelExecuteBtn.addEventListener('click', triggerNptelFill);
    }

    // NPTEL Menu Navigator toggle & rescan
    const nptelMenuToggle = document.getElementById('nptelMenuToggle');
    const nptelMenuBody = document.getElementById('nptelMenuBody');
    const nptelMenuChevron = document.getElementById('nptelMenuChevron');
    const refreshMenuBtn = document.getElementById('refreshMenuBtn');

    if (nptelMenuToggle && nptelMenuBody) {
      nptelMenuToggle.addEventListener('click', () => {
        nptelMenuBody.classList.toggle('hidden');
        if (nptelMenuChevron) {
          nptelMenuChevron.classList.toggle('collapsed');
        }
      });
    }

    if (refreshMenuBtn) {
      refreshMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sendToActiveTab({ action: 'SCAN_NPTEL_MENU' }, (res) => {
          if (res && res.success) {
            updateNptelMenuUI(res);
          }
        });
      });
    }

    // Profile actions
    saveProfileBtn.addEventListener('click', () => {
      saveProfileData(true);
    });

    fillProfileNowBtn.addEventListener('click', triggerProfileOnlyFill);

    // Profile input autosave on blur
    [profFullName, profRollNo, profStudentId, profEmail, profYearClass, profDivision, profBranch, profPhone].forEach(input => {
      if (input) {
        input.addEventListener('blur', () => saveProfileData(false));
      }
    });

    if (autoFillOnLoadCheck) {
      autoFillOnLoadCheck.addEventListener('change', () => {
        saveProfileData(false);
      });
    }

    // Audit Report actions
    undoBtn.addEventListener('click', triggerUndo);
    exportLogBtn.addEventListener('click', exportAuditLog);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Updates NPTEL Menu Navigator UI (Quizzes vs Lectures vs Documents)
   */
  function updateNptelMenuUI(menuData) {
    const nptelMenuSubtitle = document.getElementById('nptelMenuSubtitle');
    const nptelMenuQuizBadge = document.getElementById('nptelMenuQuizBadge');
    const nptelCurrentStatusPill = document.getElementById('nptelCurrentStatusPill');
    const nptelCurrentStatusText = document.getElementById('nptelCurrentStatusText');
    const nptelQuizzesList = document.getElementById('nptelQuizzesList');
    const nptelStatsText = document.getElementById('nptelStatsText');

    if (!menuData) return;

    const { quizzes = [], lectures = [], documents = [], activeItem, isCurrentPageQuiz, isCurrentPageLecture, isCurrentPageDocument } = menuData;

    if (nptelMenuQuizBadge) {
      nptelMenuQuizBadge.textContent = `${quizzes.length} Quizzes`;
    }

    if (nptelStatsText) {
      nptelStatsText.textContent = `${quizzes.length} Quizzes • ${lectures.length} Lectures • ${documents.length} Docs`;
    }

    if (nptelCurrentStatusPill && nptelCurrentStatusText) {
      nptelCurrentStatusPill.className = 'menu-status-pill';
      if (isCurrentPageQuiz) {
        nptelCurrentStatusPill.classList.add('is-quiz');
        nptelCurrentStatusText.textContent = `Active: ${activeItem?.title || 'Quiz / Assessment'}`;
      } else if (isCurrentPageLecture) {
        nptelCurrentStatusPill.classList.add('is-lecture');
        nptelCurrentStatusText.textContent = `Viewing Lecture: ${activeItem?.title || 'Video Lecture'}`;
      } else if (isCurrentPageDocument) {
        nptelCurrentStatusPill.classList.add('is-document');
        nptelCurrentStatusText.textContent = `Viewing Document: ${activeItem?.title || 'Notes / Transcript'}`;
      } else {
        nptelCurrentStatusText.textContent = activeItem?.title ? `Current: ${activeItem.title}` : 'Browsing Course Outline';
      }
    }

    if (nptelMenuSubtitle) {
      if (quizzes.length > 0) {
        nptelMenuSubtitle.textContent = `Found ${quizzes.length} assignments/quizzes in menu bar`;
      } else {
        nptelMenuSubtitle.textContent = 'No quizzes found in current menu';
      }
    }

    if (nptelQuizzesList) {
      if (quizzes.length === 0) {
        nptelQuizzesList.innerHTML = `<div class="menu-empty-hint">No quizzes detected in menu bar.</div>`;
      } else {
        nptelQuizzesList.innerHTML = quizzes.map((q) => {
          const isActive = !!q.isActive;
          return `
            <div class="menu-quiz-item ${isActive ? 'active' : ''}">
              <div class="quiz-item-left">
                ${q.unitLabel ? `<span class="quiz-unit-pill">${escapeHtml(q.unitLabel)}</span>` : ''}
                <span class="quiz-item-title" title="${escapeHtml(q.title)}">${escapeHtml(q.title)}</span>
              </div>
              <button class="quiz-open-btn ${isActive ? 'active-now' : ''}" data-url="${escapeHtml(q.url)}">
                ${isActive ? 'Active' : 'Open'}
              </button>
            </div>
          `;
        }).join('');

        // Wire click handler for quiz navigation
        nptelQuizzesList.querySelectorAll('.quiz-open-btn:not(.active-now)').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const url = e.currentTarget.getAttribute('data-url');
            if (url && activeTabId) {
              chrome.tabs.update(activeTabId, { url });
              window.close();
            }
          });
        });
      }
    }
  }

  /**
   * Computes non-empty line count
   */
  function updateLineCount() {
    const text = rawInput.value.trim();
    if (!text) {
      linesCounter.textContent = '0 answers';
      return 0;
    }

    const lines = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const count = lines.length;
    linesCounter.textContent = `${count} answer${count === 1 ? '' : 's'}`;
    return count;
  }

  /**
   * Computes non-empty line count for NPTEL raw answers
   */
  function updateNptelLineCount() {
    if (!nptelRawInput) return 0;
    const text = nptelRawInput.value.trim();
    if (!text) {
      if (nptelLinesCounter) nptelLinesCounter.textContent = '0 answers';
      return 0;
    }

    const lines = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const count = lines.length;
    if (nptelLinesCounter) nptelLinesCounter.textContent = `${count} answer${count === 1 ? '' : 's'}`;
    return count;
  }

  function saveNptelInputState() {
    try {
      if (nptelRawInput) {
        chrome.storage.local.set({ formflow_nptel_input: nptelRawInput.value });
      }
    } catch (e) {}
  }

  function setNptelLoading(loading) {
    if (!nptelExecuteBtn) return;
    nptelExecuteBtn.disabled = loading;
    if (loading) {
      nptelBtnSpinner?.classList.remove('hidden');
      if (nptelExecuteBtnLabel) nptelExecuteBtnLabel.textContent = 'Filling NPTEL Quiz...';
    } else {
      nptelBtnSpinner?.classList.add('hidden');
      if (nptelExecuteBtnLabel) nptelExecuteBtnLabel.textContent = '⚡ Fill NPTEL Quiz';
    }
  }

  function showNptelAlert(msg, type = 'info') {
    if (!nptelPageAlert) return;
    nptelPageAlert.textContent = msg;
    nptelPageAlert.className = `alert-box ${type}`;
    nptelPageAlert.classList.remove('hidden');
  }

  function hideNptelAlert() {
    nptelPageAlert?.classList.add('hidden');
  }

  /**
   * Triggers the Flawless Zero-Glitch Quiz-to-PDF Exporter
   * Captures entire active quiz (all questions, options, MathJax formulas, and pre-hydrated images)
   */
  async function triggerExportPdf() {
    if (!activeTabId) {
      showNptelAlert('No active tab connected.', 'error');
      return;
    }

    const highlight = highlightPdfCheck ? highlightPdfCheck.checked : true;

    exportPdfBtn.disabled = true;
    pdfBtnSpinner?.classList.remove('hidden');
    if (exportPdfBtnLabel) exportPdfBtnLabel.textContent = 'Generating PDF...';
    pdfStatusBanner?.classList.remove('hidden');
    if (pdfStatusText) pdfStatusText.textContent = 'Pre-hydrating diagrams & formulas...';

    // Ensure content scripts are active
    await ensureContentScriptsInjected(activeTabId);
    if (activeFrameId === null) {
      activeFrameId = await resolveActiveAssessmentFrame(activeTabId);
    }

    sendToActiveTab(
      {
        action: 'EXPORT_PDF',
        highlightSelected: highlight
      },
      async (response) => {
        // If messaging port failed or closed, fall back to direct executeScript
        if (chrome.runtime.lastError || !response || !response.success) {
          console.warn('[FormFlow] Direct message failed, attempting script fallback...', chrome.runtime.lastError);
          try {
            const targetOpts = (typeof activeFrameId === 'number' && activeFrameId !== 0)
              ? { tabId: activeTabId, frameIds: [activeFrameId] }
              : { tabId: activeTabId, allFrames: true };

            const execRes = await chrome.scripting.executeScript({
              target: targetOpts,
              func: async (hl) => {
                if (window.FormFlow && window.FormFlow.PdfExporter) {
                  return await window.FormFlow.PdfExporter.exportQuizToPdf({ highlightSelected: hl });
                }
                return null;
              },
              args: [highlight]
            });

            const match = execRes && execRes.find(r => r.result && r.result.success);
            if (match) {
              handlePdfExportSuccess(match.result);
              return;
            }
          } catch (execErr) {
            console.error('[FormFlow] Fallback script execution error:', execErr);
          }

          exportPdfBtn.disabled = false;
          pdfBtnSpinner?.classList.add('hidden');
          if (exportPdfBtnLabel) exportPdfBtnLabel.textContent = '📄 Export Entire Quiz to PDF (With Images)';
          pdfStatusBanner?.classList.add('hidden');

          const errMsg = response?.error || chrome.runtime.lastError?.message || 'Could not detect assessment questions on this page.';
          showNptelAlert(`PDF Export Error: ${errMsg}`, 'error');
          return;
        }

        handlePdfExportSuccess(response);
      }
    );

    function handlePdfExportSuccess(res) {
      exportPdfBtn.disabled = false;
      pdfBtnSpinner?.classList.add('hidden');
      if (exportPdfBtnLabel) exportPdfBtnLabel.textContent = '📄 Export Entire Quiz to PDF (With Images)';
      pdfStatusBanner?.classList.add('hidden');
      showNptelAlert(`Exported ${res.questionCount} questions to PDF successfully!`, 'success');
      setTimeout(hideNptelAlert, 4000);
    }
  }

  /**
   * Triggers autofill for NPTEL quiz (100% quiz questions, bypassing identity pass)
   */
  async function triggerNptelFill() {
    const text = nptelRawInput ? nptelRawInput.value.trim() : '';
    if (!text) {
      showNptelAlert('Please paste your NPTEL answers before clicking Fill.', 'warning');
      nptelRawInput?.focus();
      return;
    }

    setNptelLoading(true);
    hideNptelAlert();

    await ensureContentScriptsInjected(activeTabId);
    if (activeFrameId === null) {
      activeFrameId = await resolveActiveAssessmentFrame(activeTabId);
    }

    sendToActiveTab(
      {
        action: 'FILL_FORM',
        rawAnswers: text,
        mode: 'sequential',
        skipFilledQuestions: false,
        studentProfile: null
      },
      (response) => {
        setNptelLoading(false);

        if (chrome.runtime.lastError) {
          showNptelAlert(`Error connecting to tab: ${chrome.runtime.lastError.message}`, 'error');
          return;
        }

        if (!response || !response.success) {
          showNptelAlert(response?.error || 'Failed to fill NPTEL quiz.', 'error');
          return;
        }

        latestAuditData = response;
        saveAuditState(response);
        renderAuditReport(response);
        switchTab('report');
      }
    );
  }

  /**
   * Reads profile form input values
   */
  function getProfileData() {
    return {
      fullName: (profFullName.value || '').trim(),
      rollNo: (profRollNo.value || '').trim(),
      studentId: (profStudentId.value || '').trim(),
      email: (profEmail.value || '').trim(),
      yearClass: (profYearClass.value || '').trim(),
      division: (profDivision.value || '').trim(),
      branch: (profBranch.value || '').trim(),
      phone: (profPhone.value || '').trim()
    };
  }

  /**
   * Saves profile to chrome.storage.local
   */
  async function saveProfileData(showFeedback = false) {
    const profile = getProfileData();
    const autoFill = autoFillOnLoadCheck ? autoFillOnLoadCheck.checked : false;

    try {
      await chrome.storage.local.set({
        studentProfile: profile,
        autoFillProfileOnLoad: autoFill
      });

      checkProfileOnboardingStatus();

      if (showFeedback) {
        showProfileAlert('Student Profile saved successfully!', 'success');
        setTimeout(hideProfileAlert, 2500);
      }
    } catch (e) {
      if (showFeedback) {
        showProfileAlert('Failed to save profile: ' + e.message, 'error');
      }
    }
  }

  function checkProfileOnboardingStatus() {
    const profile = getProfileData();
    const hasDetails = profile.fullName.length > 0 || profile.rollNo.length > 0;
    if (profileOnboardingBanner) {
      if (hasDetails) {
        profileOnboardingBanner.classList.add('hidden');
      } else {
        profileOnboardingBanner.classList.remove('hidden');
      }
    }
  }

  /**
   * Triggers Pass 1 Profile Fill ONLY
   */
  async function triggerProfileOnlyFill() {
    saveProfileData(false);
    const profile = getProfileData();

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showProfileAlert('No active tab found.', 'error');
      return;
    }

    fillProfileNowBtn.disabled = true;
    fillProfileNowBtn.textContent = 'Filling Profile...';

    sendToActiveTab(
      {
        action: 'FILL_PROFILE_ONLY',
        studentProfile: profile
      },
      (response) => {
        fillProfileNowBtn.disabled = false;
        fillProfileNowBtn.textContent = '⚡ Fill Profile Only Now';

        if (chrome.runtime.lastError) {
          showProfileAlert(`Error: ${chrome.runtime.lastError.message}`, 'error');
          return;
        }

        if (!response || !response.success) {
          showProfileAlert(response?.error || 'Failed to fill profile fields.', 'error');
          return;
        }

        latestAuditData = response;
        saveAuditState(response);
        renderAuditReport(response);
        switchTab('report');
      }
    );
  }

  /**
   * Triggers the 2-Pass autofill execution (Profile + Answers)
   */
  async function triggerAutofill() {
    const text = rawInput.value.trim();
    if (!text) {
      showAlert('Please paste your answers before clicking Fill Form.', 'warning');
      rawInput.focus();
      return;
    }

    const mode = document.querySelector('input[name="matchingMode"]:checked')?.value || 'sequential';
    const shouldSkipFilled = skipFilledCheck ? skipFilledCheck.checked : true;
    
    // Ensure we merge saved storage profile with any current inputs
    let profile = getProfileData();
    try {
      const stored = await chrome.storage.local.get('studentProfile');
      if (stored && stored.studentProfile) {
        for (const key in stored.studentProfile) {
          if (!profile[key] && stored.studentProfile[key]) {
            profile[key] = stored.studentProfile[key];
          }
        }
      }
    } catch (e) {}

    setLoading(true);
    hideAlert();

    sendToActiveTab(
      {
        action: 'FILL_FORM',
        rawAnswers: text,
        mode: mode,
        skipFilledQuestions: shouldSkipFilled,
        studentProfile: profile
      },
      (response) => {
        setLoading(false);

        if (chrome.runtime.lastError) {
          showAlert(`Error connecting to tab: ${chrome.runtime.lastError.message}`, 'error');
          return;
        }

        if (!response || !response.success) {
          showAlert(response?.error || 'Failed to fill form.', 'error');
          return;
        }

        // Autofill succeeded
        latestAuditData = response;
        saveAuditState(response);
        renderAuditReport(response);
        switchTab('report');
      }
    );
  }

  /**
   * Reverts changes made by FormFlow (preserves profile by default)
   */
  async function triggerUndo() {
    sendToActiveTab({ action: 'UNDO_FILL', preserveProfile: true }, (response) => {
      if (response && response.success) {
        showAlert('Autofilled inputs reverted (student profile preserved).', 'info');
        switchTab('input');
      } else {
        showAlert(response?.message || 'Could not revert changes.', 'warning');
      }
    });
  }

  /**
   * Smoothly scrolls the target question on Google Form into view
   */
  function jumpToQuestion(questionId) {
    sendToActiveTab({
      action: 'SCROLL_TO_QUESTION',
      questionId: questionId
    });
  }

  /**
   * Renders the execution audit report in Tab 3
   */
  function renderAuditReport(data) {
    if (!data || !data.auditLog) return;

    reportEmptyState.classList.add('hidden');
    reportSummaryCard.classList.remove('hidden');
    auditListContainer.classList.remove('hidden');
    reportActionsBar.classList.remove('hidden');

    const total = data.totalQuestions || data.auditLog.length;
    const filled = data.filledCount || 0;
    const pct = total > 0 ? Math.round((filled / total) * 100) : 0;

    summaryScore.textContent = `${filled} / ${total}`;
    summaryPercent.textContent = `${pct}%`;
    summaryProgressFill.style.width = `${pct}%`;

    if (chipProfile) {
      chipProfile.textContent = `Profile: ${data.profileCount || 0}`;
    }
    chipExact.textContent = `Exact: ${data.exactCount || 0}`;
    chipFuzzy.textContent = `Fuzzy: ${data.fuzzyCount || 0}`;
    if (chipPrefilled) {
      chipPrefilled.textContent = `Pre-filled: ${data.prefilledCount || 0}`;
    }
    chipUnmatched.textContent = `Action Needed: ${data.unmatchedCount || 0}`;
    chipSkipped.textContent = `Skipped: ${data.skippedCount || 0}`;

    // Update Tab badge
    reportCountBadge.textContent = `${filled}/${total}`;
    reportCountBadge.classList.remove('hidden');

    // Populate itemized list
    auditItemsList.innerHTML = '';

    data.auditLog.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'audit-item-row';

      const left = document.createElement('div');
      left.className = 'audit-item-left';

      const titleRow = document.createElement('div');
      titleRow.className = 'audit-item-title-row';

      const qNum = document.createElement('span');
      qNum.className = 'audit-q-num';
      qNum.textContent = `Q${item.index}`;

      const qTitle = document.createElement('span');
      qTitle.className = 'audit-q-title';
      qTitle.textContent = item.title;
      qTitle.title = item.title;

      titleRow.appendChild(qNum);
      titleRow.appendChild(qTitle);

      const matchRow = document.createElement('div');
      matchRow.className = 'audit-item-match';

      if (item.status === 'PROFILE_FILLED') {
        matchRow.innerHTML = `
          <span class="match-arrow">↳</span>
          <span class="match-value" style="color: #a5b4fc;">Auto-filled from Profile: "${escapeHtml(item.matchedValue)}"</span>
        `;
      } else if (item.status === 'SKIPPED_PREFILLED') {
        matchRow.innerHTML = `
          <span class="match-arrow">↳</span>
          <span class="match-value" style="color: #a1a1aa; font-style: italic;">Skipped (Already filled: "${escapeHtml(item.matchedValue || item.userAnswer)}")</span>
        `;
      } else if (item.matchedValue) {
        matchRow.innerHTML = `
          <span class="match-arrow">↳</span>
          <span class="match-value" title="${escapeHtml(item.matchedValue)}">${escapeHtml(item.matchedValue)}</span>
        `;
      } else {
        matchRow.innerHTML = `<span class="match-arrow">↳</span> <span class="match-value" style="color: #a1a1aa; font-style: italic;">No match selected</span>`;
      }

      left.appendChild(titleRow);
      left.appendChild(matchRow);

      const right = document.createElement('div');
      right.className = 'audit-item-right';

      const statusBadge = document.createElement('span');
      statusBadge.className = `status-badge ${item.status.toLowerCase()}`;
      if (item.status === 'PROFILE_FILLED') {
        statusBadge.textContent = '👤 Profile';
      } else if (item.status === 'EXACT') {
        statusBadge.textContent = '100% Exact';
      } else if (item.status === 'FUZZY') {
        statusBadge.textContent = `${Math.round(item.score * 100)}% Fuzzy`;
      } else if (item.status === 'SKIPPED_PREFILLED') {
        statusBadge.textContent = '↷ Pre-filled';
      } else if (item.status === 'UNMATCHED') {
        statusBadge.textContent = 'Action Needed';
      } else {
        statusBadge.textContent = 'Skipped';
      }

      const jumpBtn = document.createElement('button');
      jumpBtn.className = 'jump-btn';
      jumpBtn.textContent = 'Jump';
      jumpBtn.title = 'Scroll directly to this question on the form';
      jumpBtn.addEventListener('click', () => jumpToQuestion(item.questionId));

      right.appendChild(statusBadge);
      right.appendChild(jumpBtn);

      row.appendChild(left);
      row.appendChild(right);
      auditItemsList.appendChild(row);
    });
  }

  /**
   * Exports audit log as downloadable JSON file
   */
  function exportAuditLog() {
    if (!latestAuditData) return;

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(latestAuditData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `formflow-audit-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  function setLoading(loading) {
    executeBtn.disabled = loading;
    if (loading) {
      btnSpinner.classList.remove('hidden');
      executeBtnLabel.textContent = 'Filling Form...';
    } else {
      btnSpinner.classList.add('hidden');
      executeBtnLabel.textContent = 'Fill Form (Profile + Answers)';
    }
  }

  function showAlert(msg, type = 'info') {
    pageAlert.textContent = msg;
    pageAlert.className = `alert-box ${type}`;
    pageAlert.classList.remove('hidden');
  }

  function hideAlert() {
    pageAlert.classList.add('hidden');
  }

  function showProfileAlert(msg, type = 'info') {
    profileAlert.textContent = msg;
    profileAlert.className = `alert-box ${type}`;
    profileAlert.classList.remove('hidden');
  }

  function hideProfileAlert() {
    profileAlert.classList.add('hidden');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- PERSISTENCE ---
  function saveInputState() {
    try {
      chrome.storage.local.set({ formflow_input: rawInput.value });
    } catch (e) {}
  }

  function saveAuditState(data) {
    try {
      chrome.storage.local.set({ formflow_last_audit: data });
    } catch (e) {}
  }

  async function loadStoredData() {
    try {
      const stored = await chrome.storage.local.get([
        'formflow_input',
        'formflow_nptel_input',
        'formflow_last_audit',
        'formflow_skip_filled',
        'studentProfile',
        'autoFillProfileOnLoad'
      ]);

      if (stored.formflow_input) {
        rawInput.value = stored.formflow_input;
      }
      if (stored.formflow_nptel_input && nptelRawInput) {
        nptelRawInput.value = stored.formflow_nptel_input;
        updateNptelLineCount();
      }
      if (stored.formflow_skip_filled !== undefined && skipFilledCheck) {
        skipFilledCheck.checked = stored.formflow_skip_filled;
      }

      // Populate student profile fields
      if (stored.studentProfile) {
        const p = stored.studentProfile;
        if (p.fullName && profFullName) profFullName.value = p.fullName;
        if (p.rollNo && profRollNo) profRollNo.value = p.rollNo;
        if (p.studentId && profStudentId) profStudentId.value = p.studentId;
        if (p.email && profEmail) profEmail.value = p.email;
        if (p.yearClass && profYearClass) profYearClass.value = p.yearClass;
        if (p.division && profDivision) profDivision.value = p.division;
        if (p.branch && profBranch) profBranch.value = p.branch;
        if (p.phone && profPhone) profPhone.value = p.phone;
      }

      if (stored.autoFillProfileOnLoad !== undefined && autoFillOnLoadCheck) {
        autoFillOnLoadCheck.checked = stored.autoFillProfileOnLoad;
      }

      if (stored.formflow_last_audit) {
        latestAuditData = stored.formflow_last_audit;
        renderAuditReport(stored.formflow_last_audit);
      }
    } catch (e) {}
  }
})();
