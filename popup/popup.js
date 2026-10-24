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
  const tabProfileBtn = document.getElementById('tabProfileBtn');
  const tabReportBtn = document.getElementById('tabReportBtn');
  const reportCountBadge = document.getElementById('reportCountBadge');
  const viewInput = document.getElementById('viewInput');
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

      chrome.tabs.sendMessage(activeTabId, { action: 'GET_FORM_INFO' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          setConnectionState(false, 'Not on Google Form');
          showAlert('Please open a Google Form or FormFlow test page to use autofill.', 'warning');
          activeTabIsForm = false;
        } else if (response.isForm) {
          let statusText = `Connected (${response.questionCount} Qs`;
          if (response.identityCount > 0) {
            statusText += ` • ${response.identityCount} Profile`;
          }
          if (response.prefilledCount > 0) {
            statusText += ` • ${response.prefilledCount} Filled`;
          }
          statusText += ')';

          setConnectionState(true, statusText);
          activeTabIsForm = true;
          hideAlert();
        } else {
          setConnectionState(false, 'No questions found');
          showAlert('Page open, but 0 Google Form questions detected.', 'warning');
          activeTabIsForm = false;
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
   * Sets up 3-Tab switching
   */
  function setupTabNavigation() {
    tabInputBtn.addEventListener('click', () => switchTab('input'));
    tabProfileBtn.addEventListener('click', () => switchTab('profile'));
    tabReportBtn.addEventListener('click', () => switchTab('report'));
    goToInputBtn.addEventListener('click', () => switchTab('input'));

    if (bannerSetupBtn) {
      bannerSetupBtn.addEventListener('click', () => switchTab('profile'));
    }
  }

  function switchTab(tabName) {
    [tabInputBtn, tabProfileBtn, tabReportBtn].forEach(btn => btn?.classList.remove('active'));
    [viewInput, viewProfile, viewReport].forEach(view => view?.classList.remove('active'));

    if (tabName === 'input') {
      tabInputBtn.classList.add('active');
      viewInput.classList.add('active');
    } else if (tabName === 'profile') {
      tabProfileBtn.classList.add('active');
      viewProfile.classList.add('active');
      profFullName.focus();
    } else if (tabName === 'report') {
      tabReportBtn.classList.add('active');
      viewReport.classList.add('active');
    }
  }

  /**
   * Event Listeners for Editor, Profile & Actions
   */
  function setupEventListeners() {
    // Live line count on input
    rawInput.addEventListener('input', () => {
      updateLineCount();
      saveInputState();
    });

    // Keyboard shortcut (Ctrl/Cmd + Enter)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        triggerAutofill();
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

    chrome.tabs.sendMessage(
      tab.id,
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

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showAlert('No active tab found.', 'error');
      setLoading(false);
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
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
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    chrome.tabs.sendMessage(tab.id, { action: 'UNDO_FILL', preserveProfile: true }, (response) => {
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
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'SCROLL_TO_QUESTION',
          questionId: questionId
        });
      }
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
        'formflow_last_audit',
        'formflow_skip_filled',
        'studentProfile',
        'autoFillProfileOnLoad'
      ]);

      if (stored.formflow_input) {
        rawInput.value = stored.formflow_input;
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
