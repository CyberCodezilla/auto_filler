# FormFlow — Precision Autofill for Google Forms

**FormFlow** is a zero-hallucination Chrome Extension (Manifest V3) that parses raw, unformatted multiline answers and accurately maps them to Google Form questions using a **deterministic DOM-scraping and fuzzy-matching engine**.

No generative AI or LLMs are involved in the form-filling step. The engine relies purely on string normalization, Sorensen-Dice bigram similarity with strict hard thresholds, and synthetic event dispatching designed for Google's internal `Wiz` / `Closure` framework.

---

## Key Features

* **Zero-Hallucination Architecture:** 100% deterministic matching with a 3-tier waterfall (Exact Normalized Match, Substring Inclusion, Sorensen-Dice Coefficient $\ge 0.80$). Anything below the 0.80 threshold is strictly marked as `Action Needed` rather than guessing.
* **Dual Operating Modes:**
  * **Sequential Mapping (1:1):** Maps `Answer[i]` directly to `Question[i]` on standard forms.
  * **Smart Shuffle (Option Pool):** Handles Google Forms with **"Shuffle question order"** enabled by searching unanswered choice questions globally for matching options.
* **Support for All Field Types:**
  * Multiple Choice (`div[role="radio"]`)
  * Checkboxes (`div[role="checkbox"]` with support for comma/semicolon multi-answer lines)
  * Short Answer & Paragraph (`input[type="text"]`, `input[type="email"]`, `input[type="number"]`, `textarea`)
  * Dropdowns (`div[role="listbox"]` with async popup menu resolution)
  * Linear Scales & Grids (`div[role="radiogroup"]`)
* **Skip Already-Filled & Identity Fields:**
  * Real-world Google Forms start with student/user identity fields (Full Name, Email, Roll Number). FormFlow detects fields that have already been typed or selected by the user and **skips them automatically** without advancing answer line indexes.
  * `Answer[0]` accurately starts on the first real unanswered quiz question.
  * Injects a neutral badge: `↷ Skipped (Pre-filled)` on touched forms.
  * **Zero Data Loss on Undo:** Clicking **Reset / Undo** only rolls back fields modified by FormFlow—it **never wipes out** pre-filled student details.
* **Utilitarian "Anti-AI" UI:** Sleek, developer-grade dark interface inspired by Linear, Raycast, and Vercel:
  * Compact 380px × 530px layout.
  * Real-time header connection metrics: `● Connected (13 Qs • 3 Filled • 10 To Fill)`.
  * Dedicated toggle: `[✓] Skip already-filled fields (Name, Roll No)`.
  * Live answer counter badge (`10 answers ready`).
  * Hotkey execution via `Ctrl+Enter` (or `⌘+Enter` on Mac).
  * 1-Click **"Load PRD Sample"** button.
* **In-Page Visual Indicators:** Injects non-intrusive pill badges into Google Form question cards:
  * <span style="color:#10b981;">**✓ Filled (Exact)**</span> (Emerald)
  * <span style="color:#f59e0b;">**≈ Filled (92% Match)**</span> (Amber)
  * <span style="color:#a1a1aa;">**↷ Skipped (Pre-filled)**</span> (Zinc/Slate)
  * <span style="color:#ef4444;">**✕ Action Needed**</span> (Crimson)
* **Audit Report & Jump-to-Question:**
  * Visual completion progress bar & score (e.g., `10 / 10 Questions Filled (100%)`).
  * Metric chips for `Exact`, `Fuzzy`, `Pre-filled`, `Action Needed`, and `Skipped`.
  * Itemized breakdown of matched answers and confidence ratings.
  * **Jump Button:** Smoothly scrolls the active Google Form directly to that question card and flashes a glowing focus pulse.
* **1-Click Undo / Reset:** Reverts all text inputs, radio selections, and removes in-page badges while preserving all pre-filled identity data.
* **Audit Export:** Export full JSON audit logs with 1 click.

---

## Project Structure

```
├── manifest.json              # Chrome Manifest V3 configuration
├── popup/
│   ├── popup.html             # Compact dual-tab utilitarian popup UI
│   ├── popup.css              # Zinc/Slate monochrome theme & components
│   └── popup.js               # State management, line counter, tabs & messaging
├── content/
│   ├── parser.js              # List marker stripping & 3-tier matching waterfall
│   ├── scraper.js             # Google Forms DOM extraction & [data-params] reader
│   ├── matcher.js             # Sequential & Smart Shuffle planning algorithms
│   ├── filler.js              # Synthetic event dispatcher, badges & undo manager
│   ├── content.js             # Main content script runtime message listener
│   └── inject.css             # Floating pill badges & focus pulse styles
├── icons/
│   ├── icon16.png             # Crisp high-DPI extension icons
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── mock-form/
│   └── test-google-form.html  # Full test Google Form with the 10 PRD questions
└── tests/
    └── test_engine.js         # Automated unit & integration verification suite
```

---

## Installation in Google Chrome

1. Clone or download this repository to your local machine:
   ```bash
   cd c:\Users\Win10\Desktop\Filler
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Toggle on **Developer mode** in the top-right corner.
4. Click the **Load unpacked** button in the top-left corner.
5. Select the project folder (`c:\Users\Win10\Desktop\Filler`).
6. The **FormFlow — Precision Autofill** extension will appear in your Chrome toolbar. Pin it for quick access!

---

## Quick Start & Verification

### Testing on the Local Mock Google Form

A complete local test form matching the PRD is included in this repository.

1. Open `mock-form/test-google-form.html` in Chrome (or navigate to `http://localhost:3000/mock-form/test-google-form.html` if running the dev server).
2. Click the FormFlow extension icon in your Chrome toolbar.
3. You will see:
   * Header status: `● Connected (10 Qs)`
4. Click **Load PRD Sample** to populate the 10 PRD answer lines:
   ```text
   Radio frequency band
   To carry the signal from transmitter to receiver
   Increased spectrum efficiency
   Network name
   It generally decreases
   2.4 GHz
   Bluetooth
   Reduction in signal power during propagation
   RSSI
   Transferring an ongoing connection from one cell to another
   ```
5. Press `Ctrl + Enter` or click **Fill Form**.
6. The extension instantly:
   * Matches all 10 questions with 100% accuracy.
   * Auto-switches to the **Audit Report** view showing `10 / 10 Questions Filled (100%)`.
   * Injects green/amber pills into each question card.
   * Allows you to click **Jump** on any question to smoothly scroll to it on the page.
   * Allows you to click **Undo Fill** to revert all inputs.

---

## Deterministic Matching Algorithm

The engine processes answers through a 3-tier cascade:

1. **List Marker Stripping:**
   * Removes `1. `, `A) `, `1- `, `• `, `- ` prefixes while preserving decimal numbers like `2.4 GHz`.
2. **Tier 1 — Exact Normalized Match (100% Score):**
   * Case-insensitive, unicode quote/dash-normalized, whitespace collapsed.
   * Compact whitespace check (handles spacing variations in numbers/units like `2.4 GHz` vs `2.4GHz`).
3. **Tier 2 — Substring Inclusion (92% - 98% Score):**
   * Handles cases where option text contains answer or answer contains option (e.g. `RSSI` vs `RSSI (Received Signal Strength Indicator)`).
4. **Tier 3 — Sorensen-Dice Bigram Similarity ($\ge 0.80$ Hard Threshold):**
   * $2 \times |A \cap B| / (|A| + |B|)$ on character bigrams.
   * Handles minor typos and wording differences.
   * **Hard threshold at 0.80** — anything lower is strictly marked as `UNMATCHED` / `Action Needed` to prevent false fills.

---

## Running Automated Tests

To run the verification suite via Node.js:

```bash
node tests/test_engine.js
```

All 6 test suites (List marker stripping, Normalization, Sorensen-Dice, 3-Tier Waterfall, PRD 10 Questions, and Mode 2 Smart Shuffle) pass with 100% test coverage.
