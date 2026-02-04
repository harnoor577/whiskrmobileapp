/**
 * Context-aware euthanasia detection utility for frontend UI
 * Matches backend detection logic from supabase/functions/_shared/euthanasiaKeywords.ts
 */

// Strong indicators - definitive markers that this patient was euthanized
export const STRONG_EUTHANASIA_INDICATORS = [
  'euthasol',
  'euthansol',
  'pentobarbital',
  'euthanasia record',
  'elected euthanasia',
  'humane euthanasia',
  'humanely euthanized',
  'euthanasia was performed',
  'euthanasia performed',
  'patient was euthanized',
  'proceeded with euthanasia',
];

// Weak indicators - could refer to other animals or historical context
export const WEAK_EUTHANASIA_INDICATORS = [
  'put to sleep',
  'put down',
  'passed away peacefully',
  'passed peacefully',
  'cross peacefully',
  'end of life',
  'end-of-life',
  'euthanasia',
  'euthanized',
];

// Patterns that indicate the keyword refers to OTHER animals, not this patient
const EXCLUSION_PATTERNS = [
  /other\s+(?:cats?|dogs?|pets?|animals?|patients?)\s+.*?(?:put to sleep|put down|euthanized|passed away|euthanasia)/i,
  /another\s+(?:cat|dog|pet|animal|patient)\s+.*?(?:put to sleep|put down|euthanized|passed away|euthanasia)/i,
  /(?:sibling|housemate|littermate|companion)s?\s+.*?(?:put to sleep|put down|euthanized|passed away|euthanasia)/i,
  /(?:in the house|household|at home|in the family)\s+.*?(?:put to sleep|put down|euthanized|passed away|euthanasia)/i,
  /(?:had to be|were|was)\s+put (?:to sleep|down)\s+(?:due to|because|after)/i,
  /(?:two|three|four|several|multiple|some)\s+(?:other\s+)?(?:cats?|dogs?|pets?|animals?)\s+.*?(?:put to sleep|put down|euthanized|passed)/i,
  // Patterns indicating euthanasia is being DISCUSSED as a future option, not performed
  /discuss(?:ion|ing)?\s+(?:regarding|about|of)?\s*(?:advanced\s+diagnostics\s+versus\s+)?euthanasia/i,
  /versus\s+euthanasia/i,
  /option(?:s)?\s+(?:including|of|like|such as)?\s*euthanasia/i,
  /consider(?:ing)?\s+euthanasia/i,
  /euthanasia\s+(?:may|might|could|should)\s+be\s+(?:discussed|considered|an option)/i,
  /(?:if|when|should)\s+.*?(?:no improvement|worsens?|declines?).*?euthanasia/i,
  /prognosis\s+.*?euthanasia/i,
  // Additional patterns for euthanasia as future consideration (reversed word order)
  /euthanasia\s+should\s+be\s+considered/i,
  /euthanasia\s+may\s+be\s+considered/i,
  /euthanasia\s+could\s+be\s+considered/i,
  /prepared\s+(?:for\s+)?(?:potential\s+)?euthanasia/i,
  /euthanasia\s+(?:is|as)\s+(?:an\s+)?option/i,
  /recommend(?:ed|ing)?\s+(?:to\s+)?consider\s+euthanasia/i,
  /euthanasia\s+(?:will\s+be|to\s+be)\s+(?:discussed|considered)/i,
  /may\s+need\s+to\s+consider\s+euthanasia/i,
  /owner\s+(?:is\s+)?prepared\s+(?:for|that)/i,
  /humane\s+euthanasia\s+should/i,
];

/**
 * Check if text matches any exclusion pattern (refers to other animals)
 */
function matchesExclusionPattern(text: string): boolean {
  return EXCLUSION_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Check if text contains strong euthanasia indicators
 */
function hasStrongIndicator(text: string): boolean {
  const textLower = text.toLowerCase();
  return STRONG_EUTHANASIA_INDICATORS.some(keyword => textLower.includes(keyword));
}

/**
 * Check if text contains weak euthanasia indicators that aren't excluded
 */
function hasValidWeakIndicator(text: string): boolean {
  const textLower = text.toLowerCase();
  
  // First check if any weak indicator exists
  const hasWeakIndicator = WEAK_EUTHANASIA_INDICATORS.some(keyword => textLower.includes(keyword));
  if (!hasWeakIndicator) return false;
  
  // Check if the context suggests it's about other animals
  if (matchesExclusionPattern(text)) return false;
  
  return true;
}

/**
 * Check if text contains euthanasia-related keywords with context awareness
 */
export function isEuthanasiaCase(text: string): boolean {
  // Strong indicators always count
  if (hasStrongIndicator(text)) return true;
  
  // Weak indicators only count if not excluded
  return hasValidWeakIndicator(text);
}

/**
 * Check if a consultation was an euthanasia case
 * Prioritizes assessment/plan sections over historical context
 */
export function isEuthanasiaConsult(consult: any): boolean {
  // Check for EUTHANASIA RECORD marker in chat messages (strong indicator)
  const chatContent = (consult.chat_messages || [])
    .map((m: any) => m.content)
    .join('\n');
  
  if (/EUTHANASIA RECORD/i.test(chatContent)) {
    return true;
  }

  // Priority 1: Check Assessment and Plan sections (most definitive)
  const assessmentPlanText = [
    consult.soap_a,
    consult.soap_p,
    consult.final_treatment_plan,
  ].filter(Boolean).join(' ');
  
  if (hasStrongIndicator(assessmentPlanText)) return true;
  if (hasValidWeakIndicator(assessmentPlanText)) return true;

  // Priority 2: Check Objective section
  if (consult.soap_o && isEuthanasiaCase(consult.soap_o)) return true;

  // Priority 3: Check Subjective and history (require strong indicators only)
  const historyText = [
    consult.reason_for_visit,
    consult.soap_s,
    consult.final_summary,
  ].filter(Boolean).join(' ');
  
  // For history sections, only strong indicators count to avoid false positives
  // from mentions of other animals being euthanized
  if (hasStrongIndicator(historyText)) return true;

  // Check chat content with full context awareness
  if (isEuthanasiaCase(chatContent)) return true;

  return false;
}

/**
 * Check if any of the patient's consults were euthanasia cases
 */
export function hasEuthanasiaConsult(consults: any[]): boolean {
  return consults.some(consult => isEuthanasiaConsult(consult));
}
