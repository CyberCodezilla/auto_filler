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
* **Utilitarian "Anti-AI" UI:** Sleek, developer-grade dark 

*(Day 1 Complete)*
