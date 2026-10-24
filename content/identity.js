/**
 * FormFlow - Canonical Identity Classifier & Token Deconstructor (Pass 1 Engine)
 * Identifies student profile fields on Google Forms and maps user profile attributes
 * to varied form options and text inputs with negative exclusion guards.
 */

(function () {
  'use strict';

  // Ensure FormFlow namespace
  window.FormFlow = window.FormFlow || {};

  // =========================================================================
  // 1. Synonym & Equivalence Dictionaries
  // =========================================================================

  const YEAR_EQUIVALENCE = [
    {
      canonical: 'FE',
      level: 1,
      variants: ['fe', 'f.e.', 'first year', '1st year', 'year 1', '1', 'i', 'freshman', 'fy', 'first', '1st']
    },
    {
      canonical: 'SE',
      level: 2,
      variants: ['se', 's.e.', 'second year', '2nd year', 'year 2', '2', 'ii', 'sophomore', 'sy', 'second', '2nd']
    },
    {
      canonical: 'TE',
      level: 3,
      variants: ['te', 't.e.', 'third year', '3rd year', 'year 3', '3', 'iii', 'junior', 'ty', 'third', '3rd']
    },
    {
      canonical: 'BE',
      level: 4,
      variants: ['be', 'b.e.', 'fourth year', '4th year', 'final year', 'year 4', '4', 'iv', 'senior', 'btech final', 'b.tech final', 'fourth', '4th']
    }
  ];

  const BRANCH_EQUIVALENCE = [
    {
      canonical: 'CSE-DS',
      variants: [
        'cse (data science)', 'cse-ds', 'cs-ds', 'cse ds', 'cs ds',
        'computer science and engineering (data science)',
        'computer science & engineering (data science)',
        'computer science (data science)',
        'data science', 'ds', 'cse data science', 'cs data science'
      ]
    },
    {
      canonical: 'CSE',
      variants: [
        'computer engineering', 'computer science', 'cse', 'cs', 'comps', 'cmpn',
        'computer science and engineering', 'computer science & engineering',
        'comp engg', 'comp', 'computer'
      ]
    },
    {
      canonical: 'IT',
      variants: [
        'information technology', 'it', 'inft', 'infotech', 'info tech'
      ]
    },
    {
      canonical: 'AI-DS',
      variants: [
        'artificial intelligence and data science', 'artificial intelligence & data science',
        'ai & ds', 'ai and ds', 'aids', 'ai-ds', 'ai/ds', 'ai_ds'
      ]
    },
    {
      canonical: 'AI-ML',
      variants: [
        'artificial intelligence and machine learning', 'artificial intelligence & machine learning',
        'ai & ml', 'ai and ml', 'aiml', 'ai-ml', 'ai/ml', 'ai_ml', 'machine learning', 'ml'
      ]
    },
    {
      canonical: 'EXTC',
      variants: [
        'electronics and telecommunication', 'electronics & telecommunication',
        'extc', 'entc', 'ece', 'electronics and communication',
        'electronics & communication', 'telecom', 'telecommunication'
      ]
    },
    {
      canonical: 'MECH',
      variants: [
        'mechanical engineering', 'mechanical', 'mech', 'me'
      ]
    },
    {
      canonical: 'CIVIL',
      variants: [
        'civil engineering', 'civil', 'ce'
      ]
    },
    {
      canonical: 'ELECTRICAL',
      variants: [
        'electrical engineering', 'electrical', 'ee'
      ]
    }
  ];

  // =========================================================================
  // 2. Token Deconstructor for Compound Division / Class (e.g. "TE-3", "Div B")
  // =========================================================================

  /**
   * Deconstructs a compound division/batch string like "TE-3", "SE-A", "Div 2", "C3"
   * into canonical tokens and variant aliases.
   */
  function deconstructDivision(rawDivision) {
    if (!rawDivision || typeof rawDivision !== 'string') {
      return { raw: '', prefix: null, suffix: null, variants: [] };
    }

    const trimmed = rawDivision.trim();
    const normalized = trimmed.toLowerCase();

    // Match patterns like:
    // "TE-3", "TE 3", "TE3", "TE - 3", "SE-A", "Div 2", "Division 3", "Section C", "Batch 1"
    const match = normalized.match(/^(?:([a-z]+)[-_\s]*)?([0-9]+|[a-z])$/i);

    let prefix = null;
    let suffix = null;

    if (match) {
      prefix = match[1] ? match[1].toUpperCase() : null;
      suffix = match[2] ? match[2].toUpperCase() : null;
    } else {
      // General regex search for separate letters and numbers
      const numMatch = normalized.match(/\b([0-9]+)\b/);
      const letterMatch = normalized.match(/\b([a-d])\b/i);
      const prefixMatch = normalized.match(/\b(fe|se|te|be|fy|sy|ty)\b/i);

      if (prefixMatch) prefix = prefixMatch[1].toUpperCase();
      if (numMatch) suffix = numMatch[1];
      else if (letterMatch) suffix = letterMatch[1].toUpperCase();
    }

    const variants = new Set();
    variants.add(trimmed);
    variants.add(normalized);
    variants.add(normalized.replace(/[-_\s]+/g, ''));
    variants.add(normalized.replace(/[-_]/g, ' '));

    if (suffix) {
      variants.add(suffix);
      variants.add(suffix.toLowerCase());

      // If suffix is numeric (e.g. "3")
      if (/^[0-9]+$/.test(suffix)) {
        const num = parseInt(suffix, 10);
        variants.add(String(num));
        variants.add(num < 10 ? `0${num}` : String(num));

        const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
        if (num > 0 && num < romanNumerals.length) {
          variants.add(romanNumerals[num]);
          variants.add(romanNumerals[num].toLowerCase());
        }

        variants.add(`div ${num}`);
        variants.add(`division ${num}`);
        variants.add(`sec ${num}`);
        variants.add(`section ${num}`);
        variants.add(`batch ${num}`);
        variants.add(`div-${num}`);
        variants.add(`batch-${num}`);
      } else {
        // Suffix is a letter (e.g. "A", "B", "C")
        variants.add(`div ${suffix.toLowerCase()}`);
        variants.add(`division ${suffix.toLowerCase()}`);
        variants.add(`sec ${suffix.toLowerCase()}`);
        variants.add(`section ${suffix.toLowerCase()}`);
        variants.add(`batch ${suffix.toLowerCase()}`);
      }
    }

    return {
      raw: trimmed,
      prefix, // e.g. "TE"
      suffix, // e.g. "3"
      variants: Array.from(variants)
    };
  }

  // =========================================================================
  // 3. Question Title Intent Classifier with Negative Guards
  // =========================================================================

  /**
   * Strictly evaluates if a question is an identity/student profile field.
   * Employs negative exclusion guards to prevent false positives on quiz questions.
   */
  function classifyIdentityQuestion(question) {
    if (!question || !question.title) {
      return { isIdentity: false, category: null, reason: 'No title' };
    }

    const title = question.title.trim();
    const lower = title.toLowerCase();

    // -----------------------------------------------------------------------
    // SAFETY RULE 1: Question / Quiz Phrasing Guard
    // Quiz questions almost always start with interrogative or instructional words.
    // -----------------------------------------------------------------------
    const QUIZ_START_REGEX = /^(what\s+is|which\s+of|which\s+one|how\s+does|how\s+many|how\s+much|why\s+does|why\s+is|define|explain|calculate|differentiate|describe|identify|state|in\s+the\s+context|according\s+to|select\s+the\s+correct|true\s+or\s+false)/i;
    if (QUIZ_START_REGEX.test(lower)) {
      return { isIdentity: false, category: null, reason: 'Starts with quiz phrasing' };
    }

    // -----------------------------------------------------------------------
    // SAFETY RULE 2: Technical Domain Negative Guards
    // Protects questions like "Network name", "Frequency division multiplexing",
    // "Carrier signal", "Wavelength", "Algorithm", etc.
    // -----------------------------------------------------------------------
    const TECHNICAL_EXCLUSIONS = [
      'network', 'ssid', 'domain', 'device', 'protocol', 'host', 'algorithm',
      'variable', 'file name', 'filename', 'multiplexing', 'frequency division',
      'time division', 'code division', 'wavelength', 'spectrum', 'channel',
      'signal', 'carrier', 'modulation', 'attenuation', 'bandwidth', 'packet',
      'router', 'switch', 'server', 'database', 'query', 'compiler', 'cpu',
      'memory', 'binary', 'cellular', 'propagation', 'transceiver', 'transmitter',
      'receiver', 'antenna', 'bluetooth', 'wi-fi', 'wifi', 'ieee', 'analog', 'digital'
    ];

    for (const term of TECHNICAL_EXCLUSIONS) {
      const regex = new RegExp(`\\b${term}\\b`, 'i');
      if (regex.test(lower)) {
        return { isIdentity: false, category: null, reason: `Contains technical exclusion term: "${term}"` };
      }
    }

    // -----------------------------------------------------------------------
    // CATEGORY 1: Full Name / First Name / Last Name
    // -----------------------------------------------------------------------
    const FULL_NAME_REGEX = /^(?:student'?s?\s+|candidate'?s?\s+|your\s+|enter\s+(?:your\s+)?)?(?:full\s+)?name(?:\s+of\s+(?:the\s+)?(?:student|candidate))?(?:\s*\([^)]*\))?$/i;
    if (
      FULL_NAME_REGEX.test(lower) ||
      /\b(full\s*name|student'?s?\s*name|candidate'?s?\s*name|name\s*of\s*the\s*student)\b/i.test(lower) ||
      lower === 'name' ||
      lower === 'your name'
    ) {
      return { isIdentity: true, category: 'fullName', confidence: 1.0 };
    }

    if (/\b(first\s*name|given\s*name)\b/i.test(lower)) {
      return { isIdentity: true, category: 'firstName', confidence: 1.0 };
    }
    if (/\b(last\s*name|surname|family\s*name)\b/i.test(lower)) {
      return { isIdentity: true, category: 'lastName', confidence: 1.0 };
    }

    // -----------------------------------------------------------------------
    // CATEGORY 2: Roll Number / Seat Number
    // -----------------------------------------------------------------------
    if (/\b(roll\s*(?:no|num|number)|seat\s*(?:no|number)|class\s*roll)\b/i.test(lower)) {
      if (!/\b(scroll|control|payroll|bankroll)\b/i.test(lower)) {
        return { isIdentity: true, category: 'rollNo', confidence: 1.0 };
      }
    }

    // -----------------------------------------------------------------------
    // CATEGORY 3: Student ID / PRN / Registration Number
    // -----------------------------------------------------------------------
    if (/\b(prn|pid|student\s*id|registration\s*(?:no|number)|reg\s*(?:no|num|number)|enrollment\s*(?:no|number)|sap\s*id|moodle\s*id|college\s*id|usn|uid)\b/i.test(lower)) {
      return { isIdentity: true, category: 'studentId', confidence: 1.0 };
    }

    // -----------------------------------------------------------------------
    // CATEGORY 4: Email Address
    // -----------------------------------------------------------------------
    if (/\b(email|e-mail|mail\s*id|college\s*email|institute\s*email|student\s*email|gmail)\b/i.test(lower)) {
      return { isIdentity: true, category: 'email', confidence: 1.0 };
    }

    // -----------------------------------------------------------------------
    // CATEGORY 5: Phone Number
    // -----------------------------------------------------------------------
    if (/\b(phone|mobile|contact\s*(?:no|number)|whatsapp|cell\s*(?:no|number)|telephone)\b/i.test(lower)) {
      return { isIdentity: true, category: 'phone', confidence: 1.0 };
    }

    // -----------------------------------------------------------------------
    // CATEGORY 6: Academic Year / Class
    // -----------------------------------------------------------------------
    if (/\b(academic\s*year|year\s*of\s*study|current\s*year|class|year|semester|sem)\b/i.test(lower)) {
      if (!/\b(birth|passing|established|founded|history|since|gap)\b/i.test(lower)) {
        if (question.type === 'radio' || question.type === 'dropdown') {
          if (hasYearLikeOptions(question.options)) {
            return { isIdentity: true, category: 'yearClass', confidence: 1.0 };
          }
        } else {
          return { isIdentity: true, category: 'yearClass', confidence: 0.9 };
        }
      }
    }

    // -----------------------------------------------------------------------
    // CATEGORY 7: Division / Section / Batch
    // -----------------------------------------------------------------------
    if (/\b(division|div|section|sec|batch)\b/i.test(lower)) {
      if (!/\b(multiplexing|frequency|time|code|arithmetic|divide|division\s+by)\b/i.test(lower)) {
        if (question.type === 'radio' || question.type === 'dropdown') {
          if (hasDivisionLikeOptions(question.options)) {
            return { isIdentity: true, category: 'division', confidence: 1.0 };
          }
        } else {
          return { isIdentity: true, category: 'division', confidence: 0.9 };
        }
      }
    }

    // -----------------------------------------------------------------------
    // CATEGORY 8: Branch / Department / Stream
    // -----------------------------------------------------------------------
    if (/\b(branch|department|dept|stream|course|specialization|program|programme)\b/i.test(lower)) {
      if (question.type === 'radio' || question.type === 'dropdown') {
        if (hasBranchLikeOptions(question.options)) {
          return { isIdentity: true, category: 'branch', confidence: 1.0 };
        }
      } else {
        return { isIdentity: true, category: 'branch', confidence: 0.9 };
      }
    }

    return { isIdentity: false, category: null, reason: 'Did not match any canonical identity patterns' };
  }

  // =========================================================================
  // 4. Sanity Check Helpers for Choice Options
  // =========================================================================

  function hasYearLikeOptions(options) {
    if (!options || options.length === 0) return true;
    const yearTokens = ['fe', 'se', 'te', 'be', 'fy', 'sy', 'ty', '1st', '2nd', '3rd', '4th', 'first', 'second', 'third', 'fourth', 'final', '1', '2', '3', '4'];
    let matches = 0;
    for (const opt of options) {
      const text = (opt.text || '').toLowerCase().trim();
      if (yearTokens.some(tok => text === tok || text.includes(tok))) {
        matches++;
      }
    }
    return matches >= Math.min(2, options.length);
  }

  function hasDivisionLikeOptions(options) {
    if (!options || options.length === 0) return true;
    let matches = 0;
    for (const opt of options) {
      const text = (opt.text || '').trim();
      if (
        /^(?:div(?:ision)?\s*)?[0-9a-d]$/i.test(text) ||
        /^(?:fe|se|te|be)[-_\s]*[0-9a-d]$/i.test(text) ||
        /^[0-9]+$/.test(text) ||
        /^[a-d]$/i.test(text)
      ) {
        matches++;
      }
    }
    return matches >= Math.min(2, options.length);
  }

  function hasBranchLikeOptions(options) {
    if (!options || options.length === 0) return true;
    const branchTokens = ['computer', 'cse', 'cs', 'it', 'extc', 'electronics', 'mechanical', 'civil', 'electrical', 'ai', 'ds', 'data science', 'information'];
    let matches = 0;
    for (const opt of options) {
      const text = (opt.text || '').toLowerCase();
      if (branchTokens.some(tok => text.includes(tok))) {
        matches++;
      }
    }
    return matches >= Math.min(1, options.length);
  }

  // =========================================================================
  // 5. Answer Resolver: Maps Profile Attributes to Form Elements
  // =========================================================================

  /**
   * Resolves the exact text or choice option to fill for a given identity question.
   * Handles compound values like "TE-3" -> "3" & "TE", synonyms, and option matching.
   */
  function resolveIdentityAnswer(category, profile, question) {
    if (!profile || !category) return null;

    // Normalize profile inputs
    const pFullName = (profile.fullName || '').trim();
    const pRollNo = (profile.rollNo || '').trim();
    const pStudentId = (profile.studentId || profile.prn || '').trim();
    const pEmail = (profile.email || '').trim();
    const pPhone = (profile.phone || '').trim();
    let pYearClass = (profile.yearClass || '').trim();
    const pDivision = (profile.division || '').trim();
    const pBranch = (profile.branch || '').trim();

    // Auto-infer yearClass from division if yearClass is blank (e.g. "TE-3" -> "TE")
    const divDeconstructed = deconstructDivision(pDivision);
    if (!pYearClass && divDeconstructed.prefix) {
      pYearClass = divDeconstructed.prefix;
    }

    // -----------------------------------------------------------------------
    // Case A: Text / Textarea Inputs (Short Answer & Paragraph)
    // -----------------------------------------------------------------------
    if (question.type === 'text' || question.type === 'textarea') {
      let valueToFill = '';

      switch (category) {
        case 'fullName':
          valueToFill = pFullName;
          break;
        case 'firstName': {
          const parts = pFullName.split(/\s+/);
          valueToFill = parts[0] || '';
          break;
        }
        case 'lastName': {
          const parts = pFullName.split(/\s+/);
          valueToFill = parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] || '');
          break;
        }
        case 'rollNo':
          valueToFill = pRollNo;
          break;
        case 'studentId':
          valueToFill = pStudentId || pRollNo;
          break;
        case 'email':
          valueToFill = pEmail;
          break;
        case 'phone':
          valueToFill = pPhone;
          break;
        case 'yearClass':
          valueToFill = pYearClass;
          break;
        case 'division':
          valueToFill = pDivision;
          break;
        case 'branch':
          valueToFill = pBranch;
          break;
        default:
          valueToFill = '';
      }

      if (!valueToFill) return null;

      return {
        category,
        valueToFill,
        targetOption: null,
        matchedValue: valueToFill,
        confidence: 1.0,
        reason: `Matched text field for ${category}`
      };
    }

    // -----------------------------------------------------------------------
    // Case B: Choice Inputs (Radio, Dropdown, Checkbox)
    // -----------------------------------------------------------------------
    if (question.type === 'radio' || question.type === 'dropdown' || question.type === 'checkbox') {
      const options = question.options || [];
      if (options.length === 0) return null;

      // 1. Division Resolution (e.g. user entered "TE-3", options are ["1", "2", "3", "4"])
      if (category === 'division') {
        const variants = divDeconstructed.variants;

        // Try exact match on variants
        for (const variant of variants) {
          const targetOpt = options.find(opt => {
            const optText = (opt.text || '').trim().toLowerCase();
            return optText === variant.toLowerCase() || optText.replace(/[-_\s]+/g, '') === variant.toLowerCase().replace(/[-_\s]+/g, '');
          });
          if (targetOpt) {
            return {
              category,
              valueToFill: targetOpt.text,
              targetOption: targetOpt,
              matchedValue: targetOpt.text,
              confidence: 1.0,
              reason: `Matched division option "${targetOpt.text}" from token variant "${variant}"`
            };
          }
        }

        // Substring match on suffix (e.g. option is "Batch 3" or "Div 3")
        if (divDeconstructed.suffix) {
          const suff = divDeconstructed.suffix.toLowerCase();
          const targetOpt = options.find(opt => {
            const optText = (opt.text || '').trim().toLowerCase();
            return optText.includes(suff);
          });
          if (targetOpt) {
            return {
              category,
              valueToFill: targetOpt.text,
              targetOption: targetOpt,
              matchedValue: targetOpt.text,
              confidence: 0.95,
              reason: `Matched division option "${targetOpt.text}" via suffix "${suff}"`
            };
          }
        }
      }

      // 2. Academic Year / Class Resolution (FE, SE, TE, BE Equivalence)
      if (category === 'yearClass') {
        const userYear = pYearClass.toLowerCase();

        const yearGroup = YEAR_EQUIVALENCE.find(grp =>
          grp.canonical.toLowerCase() === userYear ||
          grp.variants.includes(userYear)
        );

        if (yearGroup) {
          for (const variant of yearGroup.variants) {
            const targetOpt = options.find(opt => {
              const optText = (opt.text || '').trim().toLowerCase();
              return optText === variant || optText.replace(/[^a-z0-9]/g, '') === variant.replace(/[^a-z0-9]/g, '');
            });
            if (targetOpt) {
              return {
                category,
                valueToFill: targetOpt.text,
                targetOption: targetOpt,
                matchedValue: targetOpt.text,
                confidence: 1.0,
                reason: `Matched year option "${targetOpt.text}" for canonical year ${yearGroup.canonical}`
              };
            }
          }

          const targetOpt = options.find(opt => {
            const optText = (opt.text || '').trim().toLowerCase();
            return yearGroup.variants.some(v => optText.includes(v) && v.length >= 2);
          });
          if (targetOpt) {
            return {
              category,
              valueToFill: targetOpt.text,
              targetOption: targetOpt,
              matchedValue: targetOpt.text,
              confidence: 0.92,
              reason: `Fuzzy matched year option "${targetOpt.text}" for ${yearGroup.canonical}`
            };
          }
        }
      }

      // 3. Branch / Department Resolution (Synonym Dictionary)
      if (category === 'branch') {
        const userBranch = pBranch.toLowerCase();

        const branchGroup = BRANCH_EQUIVALENCE.find(grp =>
          grp.canonical.toLowerCase() === userBranch ||
          grp.variants.some(v => v === userBranch || userBranch.includes(v))
        );

        if (branchGroup) {
          for (const variant of branchGroup.variants) {
            const targetOpt = options.find(opt => {
              const optText = (opt.text || '').trim().toLowerCase();
              return optText === variant || optText.replace(/[^a-z0-9]/g, '') === variant.replace(/[^a-z0-9]/g, '');
            });
            if (targetOpt) {
              return {
                category,
                valueToFill: targetOpt.text,
                targetOption: targetOpt,
                matchedValue: targetOpt.text,
                confidence: 1.0,
                reason: `Matched branch option "${targetOpt.text}" for canonical branch ${branchGroup.canonical}`
              };
            }
          }

          const targetOpt = options.find(opt => {
            const optText = (opt.text || '').trim().toLowerCase();
            return branchGroup.variants.some(v => v.length >= 3 && optText.includes(v));
          });
          if (targetOpt) {
            return {
              category,
              valueToFill: targetOpt.text,
              targetOption: targetOpt,
              matchedValue: targetOpt.text,
              confidence: 0.95,
              reason: `Substring matched branch option "${targetOpt.text}" for ${branchGroup.canonical}`
            };
          }
        } else {
          const targetOpt = options.find(opt => {
            const optText = (opt.text || '').trim().toLowerCase();
            return optText === userBranch || optText.includes(userBranch) || userBranch.includes(optText);
          });
          if (targetOpt) {
            return {
              category,
              valueToFill: targetOpt.text,
              targetOption: targetOpt,
              matchedValue: targetOpt.text,
              confidence: 0.90,
              reason: `Direct matched branch option "${targetOpt.text}"`
            };
          }
        }
      }

      // 4. General fallback for other categories
      let candidateValue = '';
      if (category === 'rollNo') candidateValue = pRollNo;
      else if (category === 'studentId') candidateValue = pStudentId;
      else if (category === 'fullName') candidateValue = pFullName;

      if (candidateValue) {
        const targetOpt = options.find(opt => {
          const optText = (opt.text || '').trim().toLowerCase();
          return optText === candidateValue.toLowerCase();
        });
        if (targetOpt) {
          return {
            category,
            valueToFill: targetOpt.text,
            targetOption: targetOpt,
            matchedValue: targetOpt.text,
            confidence: 1.0,
            reason: `Direct matched option for ${category}`
          };
        }
      }
    }

    return null;
  }

  // =========================================================================
  // 6. Public API Export
  // =========================================================================

  window.FormFlow.Identity = {
    YEAR_EQUIVALENCE,
    BRANCH_EQUIVALENCE,
    deconstructDivision,
    classifyIdentityQuestion,
    resolveIdentityAnswer
  };
})();
