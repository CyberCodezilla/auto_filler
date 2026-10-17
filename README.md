# FormFlow — Precision Autofill for Google Forms

**FormFlow** is a zero-hallucination Chrome Extension (Manifest V3) that parses raw, unformatted multiline answers and accurately maps them to Google Form questions using a **deterministic DOM-scraping and fuzzy-matching engine**.

No generative AI or LLMs are involved in the form-filling step. The engine relies purely on string normalization, Sorensen-Dice bigram similarity with strict hard thresholds, and synthetic event dispatching designed for Google's internal `Wiz` / `Closure` framework.

---

## Key Features

* **Zero-Hallucination Architecture:** 100% deterministic matching with a 3-tier waterfall (Exact Normalized Match, Substring Inclusion, Sorensen-Dice Coefficient $\ge 0.80$). Anything below the 0.80 threshold is strictly marked

## Implementation in Progress...
