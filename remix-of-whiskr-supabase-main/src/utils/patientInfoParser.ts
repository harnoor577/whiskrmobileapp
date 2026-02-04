// Utility to parse patient information from free-form text
// Handles formats like: "Fluffy, Domestic Shorthair, F, 5 years"
// Also handles natural language: "Luna is a nine-year-old spayed female cat"

export interface ParsedPatientInfo {
  name: string;
  species: string;
  breed: string;
  sex: string;
  age: string;
  dateOfBirth?: string;
}

// Word to number mapping for age parsing
const wordToNumber: Record<string, number> = {
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
  'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
};

// Common species mappings
const speciesKeywords: Record<string, string> = {
  'dog': 'Canine',
  'canine': 'Canine',
  'puppy': 'Canine',
  'cat': 'Feline',
  'feline': 'Feline',
  'kitten': 'Feline',
  'bird': 'Avian',
  'avian': 'Avian',
  'rabbit': 'Rabbit',
  'bunny': 'Rabbit',
  'hamster': 'Hamster',
  'guinea pig': 'Guinea Pig',
  'ferret': 'Ferret',
  'horse': 'Equine',
  'equine': 'Equine',
  'reptile': 'Reptile',
  'snake': 'Reptile',
  'lizard': 'Reptile',
  'turtle': 'Reptile',
  'tortoise': 'Reptile',
};

// Common dog breeds
const dogBreeds = [
  'labrador', 'golden retriever', 'german shepherd', 'bulldog', 'poodle',
  'beagle', 'rottweiler', 'yorkshire terrier', 'boxer', 'dachshund',
  'siberian husky', 'husky', 'great dane', 'doberman', 'shih tzu',
  'boston terrier', 'bernese', 'pomeranian', 'havanese', 'shetland',
  'cavalier king charles', 'miniature schnauzer', 'shiba inu', 'pembroke',
  'corgi', 'australian shepherd', 'cocker spaniel', 'border collie',
  'chihuahua', 'pit bull', 'mixed breed', 'mixed', 'mutt',
];

// Common cat breeds (including hyphenated variations)
const catBreeds = [
  'domestic shorthair', 'domestic short-haired', 'domestic short haired',
  'domestic longhair', 'domestic long-haired', 'domestic long haired',
  'persian', 'maine coon', 'siamese', 'ragdoll', 'bengal', 'abyssinian', 
  'birman', 'oriental', 'sphynx', 'british shorthair', 'scottish fold', 
  'russian blue', 'burmese', 'norwegian forest', 'devon rex', 'exotic shorthair',
  'himalayan', 'tonkinese', 'mixed breed', 'mixed', 'dsh', 'dlh',
];

// Sex mappings
const sexMappings: Record<string, string> = {
  'm': 'Male',
  'male': 'Male',
  'mn': 'Male (Neutered)',
  'neutered male': 'Male (Neutered)',
  'intact male': 'Male (Intact)',
  'f': 'Female',
  'female': 'Female',
  'fs': 'Female (Spayed)',
  'spayed female': 'Female (Spayed)',
  'spayed': 'Female (Spayed)',
  'intact female': 'Female (Intact)',
  'sf': 'Female (Spayed)',
};

// Convert word-based age to number
function convertWordToNumber(word: string): number | null {
  const lower = word.toLowerCase();
  return wordToNumber[lower] ?? null;
}

// Parse age string and calculate approximate date of birth
function parseAge(ageStr: string): { age: string; dateOfBirth?: string } {
  const lowerAge = ageStr.toLowerCase().trim();
  
  // Extract numbers and units (numeric)
  const yearMatch = lowerAge.match(/(\d+)\s*[-\s]*(y|yr|yrs|year|years|yo)/i);
  const monthMatch = lowerAge.match(/(\d+)\s*[-\s]*(m|mo|mos|month|months)/i);
  const weekMatch = lowerAge.match(/(\d+)\s*[-\s]*(w|wk|wks|week|weeks)/i);
  
  // Also check for word-based ages like "nine-year-old"
  const wordYearMatch = lowerAge.match(/(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)[\s-]*(year|yr|y)[\s-]*(old)?/i);
  const wordMonthMatch = lowerAge.match(/(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[\s-]*(month|mo)[\s-]*(old)?/i);
  const wordWeekMatch = lowerAge.match(/(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[\s-]*(week|wk)[\s-]*(old)?/i);
  
  let years = yearMatch ? parseInt(yearMatch[1]) : (wordYearMatch ? convertWordToNumber(wordYearMatch[1]) || 0 : 0);
  let months = monthMatch ? parseInt(monthMatch[1]) : (wordMonthMatch ? convertWordToNumber(wordMonthMatch[1]) || 0 : 0);
  const weeks = weekMatch ? parseInt(weekMatch[1]) : (wordWeekMatch ? convertWordToNumber(wordWeekMatch[1]) || 0 : 0);
  
  // If just a number, assume years
  if (!yearMatch && !monthMatch && !weekMatch && !wordYearMatch && !wordMonthMatch && !wordWeekMatch) {
    const numMatch = lowerAge.match(/(\d+)/);
    if (numMatch) {
      years = parseInt(numMatch[1]);
    }
  }
  
  // If no age found, return empty
  if (years === 0 && months === 0 && weeks === 0) {
    return { age: '', dateOfBirth: undefined };
  }
  
  // Calculate date of birth
  const now = new Date();
  const dob = new Date(now);
  dob.setFullYear(dob.getFullYear() - years);
  dob.setMonth(dob.getMonth() - months);
  dob.setDate(dob.getDate() - (weeks * 7));
  
  // Format age string nicely
  let formattedAge = '';
  if (years > 0) {
    formattedAge += `${years} year${years > 1 ? 's' : ''}`;
  }
  if (months > 0) {
    if (formattedAge) formattedAge += ' ';
    formattedAge += `${months} month${months > 1 ? 's' : ''}`;
  }
  if (weeks > 0 && years === 0) {
    if (formattedAge) formattedAge += ' ';
    formattedAge += `${weeks} week${weeks > 1 ? 's' : ''}`;
  }
  
  return {
    age: formattedAge || ageStr,
    dateOfBirth: dob.toISOString().split('T')[0],
  };
}

// Detect species from breed or text
function detectSpecies(text: string): string {
  const lower = text.toLowerCase();
  
  // Check explicit species keywords
  for (const [keyword, species] of Object.entries(speciesKeywords)) {
    if (lower.includes(keyword)) {
      return species;
    }
  }
  
  // Check if any dog breed is mentioned
  for (const breed of dogBreeds) {
    if (lower.includes(breed)) {
      return 'Canine';
    }
  }
  
  // Check if any cat breed is mentioned
  for (const breed of catBreeds) {
    if (lower.includes(breed)) {
      return 'Feline';
    }
  }
  
  return '';
}

// Normalize breed name to standard format
function normalizeBreedName(breed: string): string {
  const lower = breed.toLowerCase();
  // Normalize hyphenated and spaced variations
  if (lower.includes('short-haired') || lower.includes('short haired') || lower === 'dsh') {
    if (lower.includes('domestic')) return 'Domestic Shorthair';
    return 'Shorthair';
  }
  if (lower.includes('long-haired') || lower.includes('long haired') || lower === 'dlh') {
    if (lower.includes('domestic')) return 'Domestic Longhair';
    return 'Longhair';
  }
  // Capitalize each word properly
  return breed.split(/[\s-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Extract breed from text
function extractBreed(text: string): string {
  const lower = text.toLowerCase();
  
  // Check dog breeds first
  for (const breed of dogBreeds) {
    if (lower.includes(breed)) {
      return normalizeBreedName(breed);
    }
  }
  
  // Check cat breeds
  for (const breed of catBreeds) {
    if (lower.includes(breed)) {
      return normalizeBreedName(breed);
    }
  }
  
  return '';
}

// Extract sex from text
function extractSex(text: string): string {
  const lower = text.toLowerCase();
  
  for (const [keyword, sex] of Object.entries(sexMappings)) {
    // Match as whole word or with common separators
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(lower)) {
      return sex;
    }
  }
  
  return '';
}

// Extract patient name from natural language
function extractNameFromNaturalLanguage(input: string): string | null {
  // Match pattern: "On exam, Name is..." (clinical note format)
  const onExamMatch = input.match(/^on\s+exam[,.\s]+([A-Z][a-z]+)\s+is\s+/i);
  if (onExamMatch && isValidPatientName(onExamMatch[1])) {
    return onExamMatch[1].trim();
  }
  
  // Match pattern: "Name is a..." or "Name is an..."
  const naturalLanguageMatch = input.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+is\s+(?:a|an)\s+/i);
  if (naturalLanguageMatch && isValidPatientName(naturalLanguageMatch[1])) {
    return naturalLanguageMatch[1].trim();
  }
  
  // Match pattern: "Name is presenting..." or "Name is quiet..."
  const presentingMatch = input.match(/^([A-Z][a-z]+)\s+is\s+(?:presenting|quiet|alert|lethargic|bright)/i);
  if (presentingMatch && isValidPatientName(presentingMatch[1])) {
    return presentingMatch[1].trim();
  }
  
  return null;
}

// Extract explicit name mentions anywhere in text
function extractExplicitNameMention(input: string): string | null {
  // Patterns to detect explicit name mentions
  const namePatterns = [
    /(?:dog's|cat's|pet's|patient's|animal's)\s+name\s+is\s+([A-Z][a-z]+)/i,
    /name\s+is\s+([A-Z][a-z]+)/i,
    /named\s+([A-Z][a-z]+)/i,
    /called\s+([A-Z][a-z]+)/i,
    /\b([A-Z][a-z]+)\s+is\s+(?:a|an)\s+\d+[\s-]*(?:year|month|week)/i,
    // Match "On exam, [Name] is..." pattern anywhere in text
    /on\s+exam[,.\s]+([A-Z][a-z]+)\s+is\s+/i,
  ];
  
  for (const pattern of namePatterns) {
    const match = input.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (isValidPatientName(name)) {
        return name;
      }
    }
  }
  return null;
}

// Validate that a string is a reasonable patient name
function isValidPatientName(name: string): boolean {
  if (!name || name.trim().length === 0) return false;
  
  const words = name.trim().split(/\s+/);
  
  // Name should be 1-3 words
  if (words.length > 3 || words.length === 0) return false;
  
  // Name should not start with common narrative words or clinical phrases
  const invalidStarters = [
    'so', 'this', 'the', 'patient', 'a', 'an', 'my', 'our', 'and', 'but', 'or',
    'he', 'she', 'it', 'they', 'we', 'i', 'you', 'what', 'when', 'where', 'why', 'how',
    'on', 'during', 'upon', 'at', 'for', 'with', 'after', 'before', 'exam', 'examination',
    'history', 'presented', 'presents', 'today', 'yesterday', 'assessment', 'plan'
  ];
  if (invalidStarters.includes(words[0].toLowerCase())) return false;
  
  // Name should not contain sentence indicators (verbs)
  const sentenceIndicators = [
    'came', 'had', 'was', 'is', 'has', 'been', 'asking', 'presenting', 
    'brought', 'reported', 'showed', 'appeared', 'seemed'
  ];
  const lowerName = name.toLowerCase();
  for (const indicator of sentenceIndicators) {
    if (lowerName.includes(` ${indicator} `) || lowerName.includes(` ${indicator}`)) return false;
  }
  
  // Each word should be relatively short (typical pet names are short)
  if (words.some(w => w.length > 15)) return false;
  
  // Name should not be too long overall (sentence-like)
  if (name.length > 30) return false;
  
  return true;
}

// Strip markdown headers and formatting from input
function stripMarkdownAndHeaders(input: string): string {
  let cleaned = input;
  
  // Remove common markdown section headers with their prefixes
  const headerPatterns = [
    /\*\*Patient Identification:\*\*\s*/gi,
    /\*\*Patient ID:\*\*\s*/gi,
    /Patient Identification:\s*/gi,
    /Patient ID:\s*/gi,
  ];
  
  for (const pattern of headerPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Remove remaining markdown bold markers
  cleaned = cleaned.replace(/\*\*/g, '');
  
  return cleaned.trim();
}

// Main parsing function
export function parsePatientIdentification(input: string): ParsedPatientInfo {
  const result: ParsedPatientInfo = {
    name: '',
    species: '',
    breed: '',
    sex: '',
    age: '',
  };
  
  if (!input || !input.trim()) {
    return result;
  }
  
  // Strip markdown and section headers before parsing
  const cleanedInput = stripMarkdownAndHeaders(input);
  
  // 1. First, check for explicit name mentions anywhere in text (e.g., "dog's name is Oliver")
  const explicitName = extractExplicitNameMention(cleanedInput);
  if (explicitName) {
    result.name = explicitName;
  }
  
  // 2. If no explicit name, try natural language pattern at beginning: "Luna is a nine-year-old..."
  if (!result.name) {
    const naturalLanguageName = extractNameFromNaturalLanguage(cleanedInput);
    if (naturalLanguageName && isValidPatientName(naturalLanguageName)) {
      result.name = naturalLanguageName;
    }
  }
  
  // 3. Fallback to comma-separated, but VALIDATE the name
  if (!result.name) {
    const parts = cleanedInput.split(/[,;|]/).map(p => p.trim()).filter(Boolean);
    if (parts.length > 0 && isValidPatientName(parts[0])) {
      result.name = parts[0];
    }
  }
  
  // Extract other fields from the entire input
  result.species = detectSpecies(cleanedInput);
  result.breed = extractBreed(cleanedInput);
  result.sex = extractSex(cleanedInput);
  
  // If we found a breed but no species, infer species from breed
  if (result.breed && !result.species) {
    result.species = detectSpecies(result.breed);
  }
  
  // Extract age from text (handles both word-based and numeric ages)
  const wordAgePatterns = [
    /(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)[\s-]*(year|yr|y)[\s-]*(old)?/i,
    /(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[\s-]*(month|mo)[\s-]*(old)?/i,
    /(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[\s-]*(week|wk)[\s-]*(old)?/i,
    /(\d+)[\s-]*(y|yr|yrs|years?|yo)[\s-]*(old)?/i,
    /(\d+)[\s-]*(m|mo|mos|months?)[\s-]*(old)?/i,
    /(\d+)[\s-]*(w|wk|wks|weeks?)[\s-]*(old)?/i,
  ];
  
  for (const pattern of wordAgePatterns) {
    const match = cleanedInput.match(pattern);
    if (match) {
      const parsed = parseAge(match[0]);
      result.age = parsed.age;
      result.dateOfBirth = parsed.dateOfBirth;
      break;
    }
  }
  
  return result;
}

// Format parsed patient info for display
export function formatPatientInfoDisplay(info: ParsedPatientInfo): string {
  const parts: string[] = [];
  
  if (info.name) parts.push(info.name);
  if (info.species) parts.push(info.species);
  if (info.breed) parts.push(info.breed);
  if (info.sex) parts.push(info.sex);
  if (info.age) parts.push(info.age);
  
  return parts.join(' • ');
}
