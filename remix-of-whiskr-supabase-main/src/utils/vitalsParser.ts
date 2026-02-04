export interface ParsedVitals {
  temperature_f?: number;
  temperature_c?: number;
  heart_rate?: number;
  respiratory_rate?: number;
  weight_kg?: number;
  weight_lb?: number;
  crt?: string;
  mucous_membranes?: string;
  attitude?: string;
  body_condition_score?: string;
  dehydration_percent?: string;
  pain_score?: number;
}

// Valid mucous membrane descriptors for validation
const validMucousMembraneTerms = [
  'pink', 'pale', 'moist', 'tacky', 'dry', 'cyanotic', 'icteric', 
  'jaundiced', 'hyperemic', 'congested', 'normal', 'bright', 
  'injected', 'muddy', 'white', 'gray', 'grey', 'red', 'brick',
  'blanched', 'sluggish', 'sticky', 'wet', 'glistening'
];

// Word to number mapping for parsing written numbers
const wordToNumber: Record<string, number> = {
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15
};

function parseNumber(value: string): number | null {
  const trimmed = value.trim().toLowerCase();
  if (wordToNumber[trimmed]) {
    return wordToNumber[trimmed];
  }
  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

export function parseVitalsFromText(text: string): ParsedVitals {
  const vitals: ParsedVitals = {};
  const lowerText = text.toLowerCase();
  
  // Temperature patterns: "temperature of 103.1°F", "temp 101.5 F", "temperature was 102.8 degrees fahrenheit"
  const tempPatterns = [
    /temperature\s*(?:of\s*|was\s*|is\s*|:?\s*)?([\d.]+)\s*°?\s*(f|c|fahrenheit|celsius)/i,
    /temp\s*(?:of\s*|was\s*|is\s*|:?\s*)?([\d.]+)\s*°?\s*(f|c|fahrenheit|celsius)/i,
    /([\d.]+)\s*°?\s*(f|c)\s*(?:temperature|temp)/i,
  ];
  
  for (const pattern of tempPatterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      if (unit.startsWith('f')) {
        vitals.temperature_f = value;
        vitals.temperature_c = parseFloat(((value - 32) * 5/9).toFixed(1));
      } else {
        vitals.temperature_c = value;
        vitals.temperature_f = parseFloat((value * 9/5 + 32).toFixed(1));
      }
      break;
    }
  }
  
  // Heart rate patterns: "heart rate of 140 bpm", "HR 120 beats per minute", "heart rate was 140"
  const hrPatterns = [
    /(?:heart rate|HR)\s*(?:of\s*|was\s*|is\s*|:?\s*)?([\d]+)\s*(?:bpm|beats?\s*per\s*minute)?/i,
    /pulse\s*(?:of\s*|was\s*|is\s*|:?\s*)?([\d]+)\s*(?:bpm|beats?\s*per\s*minute)?/i,
  ];
  
  for (const pattern of hrPatterns) {
    const match = text.match(pattern);
    if (match) {
      vitals.heart_rate = parseInt(match[1]);
      break;
    }
  }
  
  // Respiratory rate: "respiratory rate of 40 breaths per minute", "RR 24", "respiration 30"
  const rrPatterns = [
    /(?:respiratory rate|respiration|RR)\s*(?:of\s*|was\s*|is\s*|:?\s*)?([\d]+)\s*(?:bpm|breaths?\s*per\s*minute)?/i,
    /breathing\s*(?:at\s*|rate\s*(?:of\s*)?)([\d]+)\s*(?:breaths?\s*per\s*minute)?/i,
  ];
  
  for (const pattern of rrPatterns) {
    const match = text.match(pattern);
    if (match) {
      vitals.respiratory_rate = parseInt(match[1]);
      break;
    }
  }
  
  // Weight: "weighing 32 kg", "weight 70 lb", "weighs approximately 4.3 kilograms"
  const weightPatterns = [
    /(?:weighing|weighs|weight)\s*(?:of\s*|approximately\s*|about\s*|around\s*)?([\d.]+)\s*(kg|kilograms?|lb|lbs?|pounds?)/i,
    /([\d.]+)\s*(kg|kilograms?|lb|lbs?|pounds?)\s*(?:body\s*)?weight/i,
  ];
  
  for (const pattern of weightPatterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      if (unit.startsWith('k')) {
        vitals.weight_kg = value;
        vitals.weight_lb = parseFloat((value * 2.20462).toFixed(1));
      } else {
        vitals.weight_lb = value;
        vitals.weight_kg = parseFloat((value / 2.20462).toFixed(1));
      }
      break;
    }
  }
  
  // CRT: "capillary refill time of 2.5 seconds", "CRT approximately two seconds", "CRT less than 2 seconds"
  const crtPatterns = [
    /(?:capillary refill time|CRT)\s*(?:of\s*|was\s*|is\s*|:?\s*)?(?:approximately\s*|about\s*)?(?:less than\s*)?([\d.]+|one|two|three)\s*(?:and a half\s*)?seconds?/i,
    /CRT\s*[<>]?\s*([\d.]+)\s*s(?:ec)?/i,
  ];
  
  for (const pattern of crtPatterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseNumber(match[1]);
      if (value !== null) {
        vitals.crt = `${value} seconds`;
      }
      break;
    }
  }
  
  // Mucous membranes: "mucous membranes were tacky and pale pink", "MM pink and moist"
  const mmPatterns = [
    /(?:mucous membranes?)\s*(?:were|are|was|is|:)?\s*([^,.]+)/i,
    /\bMM\b\s*(?:were|are|was|is|:)?\s*([^,.]+)/i,
  ];
  
  for (const pattern of mmPatterns) {
    const match = text.match(pattern);
    if (match) {
      const value = match[1].trim().toLowerCase();
      // Only accept if it contains at least one valid mucous membrane term
      const hasValidTerm = validMucousMembraneTerms.some(term => value.includes(term));
      if (hasValidTerm && value.length > 2 && value.length < 50) {
        vitals.mucous_membranes = match[1].trim();
      }
      break;
    }
  }
  
  // Attitude/Mentation: "attitude bright and alert", "BAR", "QAR", "mentation normal"
  const attitudePatterns = [
    /(?:attitude|mentation)\s*(?:was|is|:)?\s*([^,.]+)/i,
    /\b(BAR|QAR|bright\s*(?:,?\s*)?alert\s*(?:,?\s*)?(?:and\s*)?responsive|quiet\s*(?:,?\s*)?alert\s*(?:,?\s*)?(?:and\s*)?responsive)\b/i,
  ];
  
  for (const pattern of attitudePatterns) {
    const match = text.match(pattern);
    if (match) {
      vitals.attitude = match[1].trim();
      break;
    }
  }
  
  // Body Condition Score: "BCS 5/9", "body condition score of 4 out of 9"
  const bcsPatterns = [
    /(?:body condition score|BCS)\s*(?:of\s*|was\s*|is\s*|:?\s*)?([\d]+)\s*(?:\/|out of)\s*([\d]+)/i,
    /(?:body condition score|BCS)\s*(?:of\s*|was\s*|is\s*|:?\s*)?([\d]+)/i,
  ];
  
  for (const pattern of bcsPatterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[2]) {
        vitals.body_condition_score = `${match[1]}/${match[2]}`;
      } else {
        vitals.body_condition_score = match[1];
      }
      break;
    }
  }
  
  // Dehydration: "5% dehydrated", "dehydration 3%", "estimated 4% dehydration"
  const dehydPatterns = [
    /([\d]+)\s*%\s*(?:dehydrated|dehydration)/i,
    /dehydration\s*(?:of\s*|was\s*|is\s*|:?\s*)?([\d]+)\s*%/i,
    /(?:estimated\s*)?([\d]+)\s*%\s*dehydration/i,
  ];
  
  for (const pattern of dehydPatterns) {
    const match = text.match(pattern);
    if (match) {
      vitals.dehydration_percent = `${match[1]}%`;
      break;
    }
  }
  
  // Pain Score: "pain score of 3/10", "pain 4 out of 10"
  const painPatterns = [
    /pain\s*(?:score\s*)?(?:of\s*|was\s*|is\s*|:?\s*)?([\d]+)\s*(?:\/|out of)\s*[\d]+/i,
  ];
  
  for (const pattern of painPatterns) {
    const match = text.match(pattern);
    if (match) {
      vitals.pain_score = parseInt(match[1]);
      break;
    }
  }
  
  return vitals;
}
