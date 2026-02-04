/**
 * Robust medication extraction utility for veterinary consults
 * Uses multiple strategies: known drug database, suffix patterns, and dosage context
 */

// ============ KNOWN VETERINARY DRUGS DATABASE ============
const VETERINARY_DRUGS: Record<string, string[]> = {
  antibiotics: [
    'amoxicillin', 'amoxicillin-clavulanate', 'clavamox', 'augmentin',
    'cephalexin', 'keflex', 'cefpodoxime', 'simplicef', 'convenia',
    'enrofloxacin', 'baytril', 'marbofloxacin', 'zeniquin', 'orbax',
    'metronidazole', 'flagyl', 'doxycycline', 'vibramycin', 'clindamycin',
    'antirobe', 'azithromycin', 'zithromax', 'cefovecin', 'cefazolin',
    'ampicillin', 'gentamicin', 'tobramycin', 'chloramphenicol',
    'sulfamethoxazole', 'trimethoprim', 'bactrim', 'tylosin', 'tylan',
    'rifampin', 'pradofloxacin', 'veraflox', 'ceftiofur', 'excede',
    'florfenicol', 'nuflor', 'tilmicosin', 'micotil', 'tulathromycin',
    'draxxin', 'penicillin', 'oxytetracycline', 'terramycin'
  ],
  nsaids: [
    'carprofen', 'rimadyl', 'novox', 'vetprofen', 'meloxicam', 'metacam',
    'loxicom', 'deramaxx', 'deracoxib', 'galliprant', 'grapiprant', 
    'firocoxib', 'previcox', 'equioxx', 'onsior', 'robenacoxib', 
    'piroxicam', 'feldene', 'etodolac', 'etogesic', 'ketoprofen',
    'ketofen', 'aspirin', 'bufferin', 'phenylbutazone', 'bute',
    'flunixin', 'banamine'
  ],
  opioids: [
    'tramadol', 'ultram', 'gabapentin', 'neurontin', 'pregabalin', 'lyrica',
    'buprenorphine', 'simbadol', 'buprenex', 'butorphanol', 'torbugesic',
    'torbutrol', 'hydromorphone', 'dilaudid', 'fentanyl', 'duragesic',
    'morphine', 'methadone', 'codeine', 'amantadine', 'oxymorphone',
    'numorphan'
  ],
  sedatives: [
    'trazodone', 'desyrel', 'acepromazine', 'promace', 'atravet',
    'dexmedetomidine', 'dexdomitor', 'sileo', 'medetomidine', 'domitor',
    'diazepam', 'valium', 'midazolam', 'versed', 'alprazolam', 'xanax',
    'lorazepam', 'ativan', 'clonazepam', 'klonopin', 'phenobarbital',
    'luminal', 'zolazepam', 'telazol', 'xylazine', 'rompun', 'anased'
  ],
  gastrointestinal: [
    'maropitant', 'cerenia', 'ondansetron', 'zofran', 'metoclopramide',
    'reglan', 'famotidine', 'pepcid', 'omeprazole', 'prilosec', 
    'gastrogard', 'ulcergard', 'pantoprazole', 'protonix', 'ranitidine',
    'zantac', 'sucralfate', 'carafate', 'misoprostol', 'cytotec',
    'sulfasalazine', 'azulfidine', 'loperamide', 'imodium',
    'diphenoxylate', 'lomotil', 'tylosin', 'fortiflora', 'proviable',
    'probios', 'cisapride', 'propulsid', 'lactulose', 'miralax',
    'polyethylene glycol', 'psyllium', 'metamucil', 'esomeprazole',
    'nexium', 'cimetidine', 'tagamet', 'bismuth subsalicylate',
    'pepto-bismol', 'kaolin', 'pectin', 'kaopectate'
  ],
  steroids: [
    'prednisone', 'prednisolone', 'pred', 'dexamethasone', 'decadron',
    'azium', 'methylprednisolone', 'depo-medrol', 'medrol', 'solu-medrol',
    'triamcinolone', 'vetalog', 'kenalog', 'betamethasone', 'celestone',
    'hydrocortisone', 'cortef', 'budesonide', 'entocort', 'pulmicort',
    'fluticasone', 'flovent', 'flonase', 'mometasone', 'nasonex'
  ],
  cardiac: [
    'atenolol', 'tenormin', 'propranolol', 'inderal', 'metoprolol',
    'lopressor', 'carvedilol', 'coreg', 'sotalol', 'betapace',
    'diltiazem', 'cardizem', 'amlodipine', 'norvasc', 'enalapril',
    'vasotec', 'enacard', 'benazepril', 'lotensin', 'fortekor',
    'lisinopril', 'zestril', 'ramipril', 'altace', 'pimobendan',
    'vetmedin', 'digoxin', 'lanoxin', 'cardoxin', 'furosemide',
    'lasix', 'salix', 'disal', 'spironolactone', 'aldactone',
    'hydrochlorothiazide', 'hctz', 'torsemide', 'demadex',
    'sildenafil', 'viagra', 'revatio', 'tadalafil', 'cialis',
    'nitroglycerin', 'nitro', 'theophylline', 'aminophylline',
    'terbutaline', 'albuterol', 'proventil', 'ventolin'
  ],
  antiparasitics: [
    'ivermectin', 'heartgard', 'iverhart', 'tri-heart', 'ivomec',
    'milbemycin', 'interceptor', 'sentinel', 'trifexis',
    'selamectin', 'revolution', 'stronghold', 'moxidectin',
    'proheart', 'advantage multi', 'advocate', 'coraxis',
    'imidacloprid', 'advantage', 'fipronil', 'frontline',
    'afoxolaner', 'nexgard', 'fluralaner', 'bravecto',
    'sarolaner', 'simparica', 'simparica trio', 'lotilaner',
    'credelio', 'spinosad', 'comfortis', 'fenbendazole',
    'panacur', 'safe-guard', 'pyrantel', 'strongid', 'nemex',
    'praziquantel', 'droncit', 'drontal', 'epsiprantel', 'cestex',
    'emodepside', 'profender', 'ponazuril', 'marquis',
    'sulfadimethoxine', 'albon', 'metronidazole', 'ronidazole',
    'nitazoxanide', 'navigator', 'amprolium', 'corid',
    'toltrazuril', 'baycox', 'diclazuril', 'vecoxan'
  ],
  thyroid: [
    'methimazole', 'tapazole', 'felimazole', 'levothyroxine',
    'soloxine', 'thyro-tabs', 'synthroid', 'carbimazole'
  ],
  diabetes: [
    'insulin', 'vetsulin', 'caninsulin', 'prozinc', 'lantus',
    'glargine', 'levemir', 'detemir', 'novolog', 'aspart',
    'humalog', 'lispro', 'nph', 'humulin', 'novolin',
    'bexagliflozin', 'bexacat', 'glipizide', 'glucotrol',
    'metformin', 'glucophage'
  ],
  antihistamines: [
    'diphenhydramine', 'benadryl', 'cetirizine', 'zyrtec',
    'loratadine', 'claritin', 'fexofenadine', 'allegra',
    'chlorpheniramine', 'chlortrimeton', 'hydroxyzine',
    'atarax', 'vistaril', 'clemastine', 'tavist',
    'cyproheptadine', 'periactin', 'apoquel', 'oclacitinib',
    'cytopoint', 'lokivetmab', 'atopica', 'cyclosporine',
    'neoral', 'optimmune', 'tacrolimus', 'protopic'
  ],
  antifungals: [
    'ketoconazole', 'nizoral', 'itraconazole', 'sporanox',
    'itrafungol', 'fluconazole', 'diflucan', 'terbinafine',
    'lamisil', 'griseofulvin', 'fulvicin', 'amphotericin b',
    'fungizone', 'miconazole', 'monistat', 'clotrimazole',
    'lotrimin', 'nystatin', 'mycostatin', 'posaconazole',
    'voriconazole', 'vfend'
  ],
  urinary: [
    'phenylpropanolamine', 'proin', 'propalin', 'prazosin',
    'minipress', 'tamsulosin', 'flomax', 'bethanechol',
    'urecholine', 'diethylstilbestrol', 'des', 'estriol',
    'incurin', 'pentosan polysulfate', 'elmiron',
    'amitriptyline', 'elavil', 'phenoxybenzamine', 'dibenzyline',
    'oxybutynin', 'ditropan'
  ],
  behavioral: [
    'fluoxetine', 'prozac', 'reconcile', 'sertraline', 'zoloft',
    'paroxetine', 'paxil', 'clomipramine', 'clomicalm', 'anafranil',
    'amitriptyline', 'elavil', 'buspirone', 'buspar',
    'selegiline', 'anipryl', 'eldepryl', 'mirtazapine', 'remeron',
    'doxepin', 'sinequan', 'imipramine', 'tofranil'
  ],
  anesthetics: [
    'propofol', 'diprivan', 'rapinovet', 'ketamine', 'ketaset',
    'vetalar', 'alfaxalone', 'alfaxan', 'etomidate', 'amidate',
    'isoflurane', 'isoflor', 'sevoflurane', 'sevoflor',
    'desflurane', 'thiopental', 'pentothal', 'tiletamine',
    'telazol', 'lidocaine', 'xylocaine', 'bupivacaine',
    'marcaine', 'mepivacaine', 'carbocaine', 'ropivacaine',
    'naropin', 'procaine', 'novocaine'
  ],
  euthanasia: [
    'euthasol', 'fatal-plus', 'euthansol', 'pentobarbital',
    'sleepaway', 'socumb', 'beuthanasia', 'euthanasia solution'
  ],
  muscleRelaxants: [
    'methocarbamol', 'robaxin', 'cyclobenzaprine', 'flexeril',
    'atracurium', 'tracrium', 'vecuronium', 'norcuron',
    'pancuronium', 'pavulon', 'cisatracurium', 'nimbex',
    'dantrolene', 'dantrium', 'baclofen', 'lioresal'
  ],
  ophthalmic: [
    'tobramycin', 'tobrex', 'ciprofloxacin', 'ciloxan',
    'ofloxacin', 'ocuflox', 'gentamicin', 'gentak',
    'neomycin', 'polymyxin', 'neo-poly-dex', 'neo-poly-bac',
    'optimmune', 'cyclosporine', 'restasis', 'tacrolimus',
    'protopic', 'dorzolamide', 'trusopt', 'cosopt',
    'timolol', 'timoptic', 'latanoprost', 'xalatan',
    'travoprost', 'travatan', 'bimatoprost', 'lumigan',
    'diclofenac', 'voltaren', 'flurbiprofen', 'ocufen',
    'ketorolac', 'acular', 'atropine', 'tropicamide',
    'mydriacyl', 'phenylephrine', 'neo-synephrine',
    'erythromycin', 'ilotycin', 'terramycin',
    'oxytetracycline', 'bacitracin', 'moxifloxacin',
    'vigamox', 'levofloxacin', 'quixin'
  ],
  dermatologic: [
    'mupirocin', 'bactoderm', 'bactroban', 'silver sulfadiazine',
    'silvadene', 'ketoconazole shampoo', 'nizoral shampoo',
    'chlorhexidine', 'hibiclens', 'malaseb', 'miconazole',
    'monistat', 'clotrimazole', 'lotrimin', 'tresaderm',
    'mometamax', 'otomax', 'posatex', 'animax', 'panalog',
    'synotic', 'osurnia', 'surolan', 'zymox', 'epi-otic',
    'hydroxyzine', 'apoquel', 'atopica', 'cytopoint',
    'genesis topical spray', 'gentamicin spray',
    'dermalone', 'gentocin spray'
  ],
  supplements: [
    'glucosamine', 'chondroitin', 'dasuquin', 'cosequin',
    'glycoflex', 'adequan', 'legend', 'omega-3', 'fish oil',
    'welactin', 'sam-e', 'denamarin', 'denosyl', 'marin',
    'milk thistle', 'silybin', 'vitamin e', 'vitamin b12',
    'cobalamin', 'vitamin k', 'menatetrenone', 'phytonadione',
    'iron', 'ferrous sulfate', 'pet-tinic', 'zinc',
    'probiotics', 'fortiflora', 'proviable', 'visbiome',
    'antinol', 'movoflex', 'synovi g4', 'joint max',
    'missing link', 'flexadin', 'phycox', 'arthrisoothe'
  ],
  anticonvulsants: [
    'phenobarbital', 'luminal', 'potassium bromide', 'kbr',
    'levetiracetam', 'keppra', 'zonisamide', 'zonegran',
    'gabapentin', 'pregabalin', 'diazepam', 'valium',
    'clorazepate', 'tranxene', 'felbamate', 'felbatol',
    'topiramate', 'topamax', 'primidone', 'mysoline'
  ],
  oncology: [
    'vincristine', 'oncovin', 'vinblastine', 'velban',
    'cyclophosphamide', 'cytoxan', 'doxorubicin', 'adriamycin',
    'carboplatin', 'paraplatin', 'cisplatin', 'platinol',
    'lomustine', 'ccnu', 'gleolan', 'chlorambucil', 'leukeran',
    'melphalan', 'alkeran', 'mitoxantrone', 'novantrone',
    'toceranib', 'palladia', 'masitinib', 'masivet',
    'prednisolone', 'piroxicam', 'l-asparaginase', 'elspar',
    'methotrexate', 'trexall', '5-fluorouracil', 'efudex'
  ]
};

// ============ DRUG SUFFIX PATTERNS ============
const DRUG_SUFFIXES = [
  // Antibiotics
  'cillin',     // amoxicillin, ampicillin
  'mycin',      // gentamicin, azithromycin, erythromycin
  'cycline',    // doxycycline, tetracycline
  'floxacin',   // enrofloxacin, ciprofloxacin
  'micin',      // gentamicin (alternate)
  
  // Cardiovascular
  'olol',       // atenolol, propranolol (beta blockers)
  'pril',       // enalapril, benazepril (ACE inhibitors)
  'sartan',     // losartan, valsartan (ARBs)
  'dipine',     // amlodipine (calcium channel blockers)
  'semide',     // furosemide (loop diuretics)
  
  // NSAIDs
  'profen',     // carprofen, ibuprofen
  'coxib',      // deracoxib, firocoxib
  'oxicam',     // meloxicam, piroxicam
  
  // Steroids
  'olone',      // prednisolone, triamcinolone
  'asone',      // dexamethasone, betamethasone
  
  // Neuro/Psych
  'azepam',     // diazepam, lorazepam (benzodiazepines)
  'oxetine',    // fluoxetine, paroxetine (SSRIs)
  'barbital',   // phenobarbital, pentobarbital
  'pentin',     // gabapentin
  
  // Antiparasitics
  'mectin',     // ivermectin, milbemycin
  'laner',      // afoxolaner, sarolaner
  
  // Antifungals
  'conazole',   // fluconazole, ketoconazole
  'fungin',     // caspofungin
  
  // Anesthetics
  'flurane',    // isoflurane, sevoflurane
  'caine',      // lidocaine, bupivacaine
  
  // GI/PPIs
  'prazole',    // omeprazole, pantoprazole
  'tidine',     // famotidine, ranitidine (H2 blockers)
  
  // Others
  'triptan',    // sumatriptan
  'statin',     // atorvastatin (rarely used in vet)
  'thiazide',   // hydrochlorothiazide
];

// ============ DOSAGE CONTEXT PATTERNS ============
// These help detect drug names when they appear with dosage info
const DOSAGE_PATTERNS = [
  // "Amoxicillin 250mg" or "Amoxicillin 250 mg"
  /\b([A-Z][a-zA-Z]+(?:-[A-Za-z]+)?)\s+(\d+(?:\.\d+)?)\s*(mg|g|mcg|ml|mL|cc|IU|units?)\b/g,
  
  // "Amoxicillin at 12.5 mg/kg"
  /\b([A-Z][a-zA-Z]+(?:-[A-Za-z]+)?)\s+(?:at\s+)?(\d+(?:\.\d+)?)\s*(mg|mcg|mL)\/kg\b/g,
  
  // "250mg Amoxicillin" (dosage before drug)
  /\b(\d+(?:\.\d+)?)\s*(mg|g|mcg|ml|mL)\s+([A-Z][a-zA-Z]+(?:-[A-Za-z]+)?)\b/g,
  
  // "Amoxicillin PO BID" or "Carprofen SID x 5 days"
  /\b([A-Z][a-zA-Z]+(?:-[A-Za-z]+)?)\s+(PO|SQ|SC|IM|IV|SID|BID|TID|QID|EOD|q\d+h|PRN)\b/gi,
  
  // "give Cerenia" or "prescribe Rimadyl"
  /\b(?:give|administer|prescribe|start|continue|dispense)\s+([A-Z][a-zA-Z]+(?:-[A-Za-z]+)?)\b/gi,
  
  // "Rimadyl tablets" or "Cerenia injection"
  /\b([A-Z][a-zA-Z]+(?:-[A-Za-z]+)?)\s+(tablets?|capsules?|injection|solution|suspension|chewables?|chews?|liquid|drops?|ointment|cream|spray|gel)\b/gi,
  
  // "on Gabapentin" or "taking Carprofen"
  /\b(?:on|taking|receiving|using)\s+([A-Z][a-zA-Z]+(?:-[A-Za-z]+)?)\b/gi,
];

// ============ STRICT DRUG SUFFIXES (High specificity only) ============
const STRICT_DRUG_SUFFIXES = [
  'cillin', 'mycin', 'cycline', 'floxacin',  // Antibiotics
  'olol', 'pril', 'sartan', 'dipine',        // Cardiac
  'profen', 'coxib', 'oxicam',               // NSAIDs
  'olone', 'asone',                          // Steroids
  'azepam', 'barbital',                      // Sedatives
  'mectin', 'laner',                         // Antiparasitics
  'conazole',                                // Antifungals
  'flurane', 'caine',                        // Anesthetics
  'prazole', 'tidine',                       // GI
  'semide',                                  // Diuretics
];

// ============ EXCLUSION LIST ============
// Common words that might match patterns but aren't drugs
const EXCLUSION_LIST = new Set([
  // Medical conditions/terms that sound like drugs
  'patient', 'owner', 'clinic', 'hospital', 'doctor', 'vet', 'veterinarian',
  'canine', 'feline', 'equine', 'bovine', 'avian', 'porcine', 'ovine',
  'normal', 'abnormal', 'positive', 'negative', 'stable', 'critical',
  'cardiac', 'hepatic', 'renal', 'pulmonary', 'respiratory', 'neurologic',
  'dermatitis', 'enteritis', 'pancreatitis', 'nephritis', 'hepatitis',
  'neoplasia', 'carcinoma', 'lymphoma', 'melanoma', 'sarcoma', 'adenoma',
  'anemia', 'thrombocytopenia', 'leukocytosis', 'azotemia', 'hypoglycemia',
  'radiograph', 'ultrasound', 'bloodwork', 'urinalysis', 'cytology',
  'surgery', 'procedure', 'examination', 'physical', 'history',
  'temperature', 'weight', 'appetite', 'lethargy', 'vomiting', 'diarrhea',
  
  // Common words ending in drug-like suffixes
  'timeline', 'medicine', 'vaccine', 'routine', 'antine', 'pristine',
  'determine', 'examine', 'urine', 'bovine', 'canine', 'feline', 'equine',
  'discipline', 'masculine', 'feminine', 'doctrine', 'porcupine',
  'genuine', 'cuisine', 'coastline', 'headline', 'deadline', 'guideline',
  'baseline', 'outline', 'online', 'offline', 'pipeline', 'machine',
  'sunshine', 'sunshine', 'valentine', 'trampoline', 'gasoline', 'adrenaline',
  'borderline', 'storyline', 'sideline', 'hotline', 'lifeline',
  
  // Body parts and anatomy
  'spine', 'mandoline', 'intestine', 'palatine', 'turbinate',
  
  // Common verbs/adjectives that get captured
  'combine', 'incline', 'decline', 'recline', 'define', 'confine',
  'undermine', 'streamline', 'discipline', 'refine', 'divine',
  'give', 'giving', 'take', 'taking', 'feeling', 'continue', 'continuing',
  'start', 'starting', 'stop', 'stopping', 'increase', 'decrease',
  'administer', 'prescribe', 'dispense', 'recommend', 'monitor', 'monitoring',
  'recheck', 'rechecking', 'follow', 'following', 'long-term', 'longterm',
  'short-term', 'shortterm', 'acute', 'chronic', 'mild', 'moderate', 'severe',
  'bilateral', 'unilateral', 'discuss', 'discussed', 'owner', 'owners',
  
  // Section headers often seen in notes
  'subjective', 'objective', 'assessment', 'plan', 'summary',
  'diagnosis', 'prognosis', 'recommendation', 'finding', 'conclusion',
  'medications', 'treatment', 'therapy', 'medication', 'dosage', 'dose',
  'tablet', 'capsule', 'injection', 'solution',
  
  // Category names that should NEVER appear as individual drugs
  'antibiotics', 'antibiotic', 'nsaids', 'nsaid', 'opioids', 'opioid',
  'sedatives', 'sedative', 'gastrointestinal', 'steroids', 'steroid',
  'cardiac', 'antiparasitics', 'antiparasitic', 'thyroid', 'diabetes',
  'antihistamines', 'antihistamine', 'antifungals', 'antifungal',
  'urinary', 'behavioral', 'anesthetics', 'anesthetic', 'euthanasia',
  'musclerelaxants', 'muscle relaxants', 'ophthalmic', 'dermatologic',
  'supplements', 'supplement', 'anticonvulsants', 'anticonvulsant',
  'oncology', 'oncologic',
  
  // People names commonly seen
  'caroline', 'jasmine', 'christine', 'clementine', 'katherine',
  'madeline', 'josephine', 'geraldine', 'jacqueline', 'adeline',
]);

// ============ TYPES ============
export interface ExtractedMedication {
  name: string;
  originalMatch: string;
  category?: string;
  confidence: 'high' | 'medium';
  source: string;
}

export interface ConsultTextSources {
  original_input?: string | null;
  soap_s?: string | null;
  soap_o?: string | null;
  soap_a?: string | null;
  soap_p?: string | null;
  case_notes?: string | null;
  discharge_summary?: string | null;
  client_education?: string | null;
}

// ============ HELPER FUNCTIONS ============
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDrugName(name: string): string {
  // Capitalize first letter of each word, handle hyphenated names
  return name
    .toLowerCase()
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
}

function isExcluded(word: string): boolean {
  return EXCLUSION_LIST.has(word.toLowerCase());
}

/**
 * Check if a word has a known drug-like suffix
 */
function hasKnownDrugSuffix(word: string): boolean {
  const lowerWord = word.toLowerCase();
  return STRICT_DRUG_SUFFIXES.some(suffix => lowerWord.endsWith(suffix));
}

/**
 * Check if a word exists in the known drug database
 */
function isInKnownDatabase(word: string): boolean {
  const lowerWord = word.toLowerCase();
  for (const drugs of Object.values(VETERINARY_DRUGS)) {
    if (drugs.includes(lowerWord)) return true;
  }
  return false;
}

// ============ EXTRACTION FUNCTIONS ============

/**
 * Extract from text using the known drug database (HIGH confidence)
 */
function extractFromKnownDatabase(text: string, sourceName: string): ExtractedMedication[] {
  const results: ExtractedMedication[] = [];
  const foundNames = new Set<string>();
  const textLower = text.toLowerCase();
  
  for (const [category, drugs] of Object.entries(VETERINARY_DRUGS)) {
    for (const drug of drugs) {
      // Skip if already found
      if (foundNames.has(drug)) continue;
      
      // Use word boundary matching
      const regex = new RegExp(`\\b${escapeRegex(drug)}\\b`, 'gi');
      const match = text.match(regex);
      
      if (match) {
        foundNames.add(drug);
        results.push({
          name: normalizeDrugName(drug),
          originalMatch: match[0],
          category,
          confidence: 'high',
          source: sourceName
        });
      }
    }
  }
  
  return results;
}

/**
 * Extract using suffix pattern matching (MEDIUM confidence)
 * Only uses STRICT suffixes that are highly specific to drugs
 */
function extractFromSuffixPatterns(text: string, sourceName: string, existingNames: Set<string>): ExtractedMedication[] {
  const results: ExtractedMedication[] = [];
  
  // Use only strict suffixes for pattern matching
  for (const suffix of STRICT_DRUG_SUFFIXES) {
    // Match words ending with the suffix
    const regex = new RegExp(`\\b([A-Z][a-z]*${suffix})\\b`, 'gi');
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const drugName = match[1].toLowerCase();
      
      // Skip if already found or excluded
      if (existingNames.has(drugName) || isExcluded(drugName)) continue;
      
      // Must be at least 5 characters for suffix matches
      if (drugName.length < 5) continue;
      
      existingNames.add(drugName);
      results.push({
        name: normalizeDrugName(match[1]),
        originalMatch: match[0],
        confidence: 'medium',
        source: sourceName
      });
    }
  }
  
  return results;
}

/**
 * Extract using dosage context patterns (MEDIUM confidence)
 */
function extractFromDosageContext(text: string, sourceName: string, existingNames: Set<string>): ExtractedMedication[] {
  const results: ExtractedMedication[] = [];
  
  for (const pattern of DOSAGE_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;
    let match;
    
    while ((match = pattern.exec(text)) !== null) {
      // Extract drug name - it could be in different capture groups depending on pattern
      let potentialDrug: string | null = null;
      
      // Check each capture group for a potential drug name
      for (let i = 1; i < match.length; i++) {
        const group = match[i];
        if (group && /^[A-Za-z]/.test(group) && group.length > 3) {
          // This looks like a drug name (starts with letter, longer than 3 chars)
          potentialDrug = group;
          break;
        }
      }
      
      if (!potentialDrug) continue;
      
      const drugName = potentialDrug.toLowerCase();
      
      // Skip if already found or excluded
      if (existingNames.has(drugName) || isExcluded(drugName)) continue;
      
      // STRICTER VALIDATION: Must be at least 5 chars AND either in known DB or have drug suffix
      if (drugName.length < 5) continue;
      if (!isInKnownDatabase(drugName) && !hasKnownDrugSuffix(drugName)) continue;
      
      existingNames.add(drugName);
      results.push({
        name: normalizeDrugName(potentialDrug),
        originalMatch: match[0],
        confidence: 'medium',
        source: sourceName
      });
    }
  }
  
  return results;
}

/**
 * Extract medications from a single text source
 */
function extractFromText(text: string, sourceName: string): ExtractedMedication[] {
  const allResults: ExtractedMedication[] = [];
  const foundNames = new Set<string>();
  
  // Strategy 1: Known drug database (highest confidence)
  const knownDrugs = extractFromKnownDatabase(text, sourceName);
  for (const drug of knownDrugs) {
    foundNames.add(drug.name.toLowerCase());
    allResults.push(drug);
  }
  
  // Strategy 2: Suffix pattern matching
  const suffixDrugs = extractFromSuffixPatterns(text, sourceName, foundNames);
  allResults.push(...suffixDrugs);
  
  // Strategy 3: Dosage context patterns
  const contextDrugs = extractFromDosageContext(text, sourceName, foundNames);
  allResults.push(...contextDrugs);
  
  return allResults;
}

/**
 * Parse case_notes JSON to extract text from wellness and procedure sections
 */
function parseCaseNotesText(caseNotes: string): string {
  try {
    const parsed = JSON.parse(caseNotes);
    const textParts: string[] = [];
    
    // Extract wellness data
    if (parsed.wellness && typeof parsed.wellness === 'object') {
      for (const value of Object.values(parsed.wellness)) {
        if (typeof value === 'string') {
          textParts.push(value);
        }
      }
    }
    
    // Extract procedure data
    if (parsed.procedure && typeof parsed.procedure === 'object') {
      for (const value of Object.values(parsed.procedure)) {
        if (typeof value === 'string') {
          textParts.push(value);
        }
      }
    }
    
    return textParts.join('\n');
  } catch {
    // Not valid JSON, return as-is
    return caseNotes;
  }
}

/**
 * Deduplicate medications, keeping highest confidence for each drug
 */
function deduplicateMedications(meds: ExtractedMedication[]): ExtractedMedication[] {
  const seen = new Map<string, ExtractedMedication>();
  const confidenceOrder = { high: 0, medium: 1 };
  
  for (const med of meds) {
    const key = med.name.toLowerCase();
    const existing = seen.get(key);
    
    if (!existing || confidenceOrder[med.confidence] < confidenceOrder[existing.confidence]) {
      seen.set(key, med);
    }
  }
  
  // Sort alphabetically by name
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// ============ MAIN EXPORT ============

/**
 * Extract all medications from consult data using multiple detection strategies
 * 
 * @param consult - Object containing text fields from a consult
 * @returns Array of extracted medications with confidence levels
 */
export function extractMedicationsFromConsult(consult: ConsultTextSources): ExtractedMedication[] {
  const allMedications: ExtractedMedication[] = [];
  
  // Define sources with priority (most likely to contain meds first)
  const sources: Array<{ field: keyof ConsultTextSources; name: string }> = [
    { field: 'soap_p', name: 'Plan' },
    { field: 'discharge_summary', name: 'Discharge' },
    { field: 'case_notes', name: 'Case Notes' },
    { field: 'original_input', name: 'Recording' },
    { field: 'soap_a', name: 'Assessment' },
    { field: 'soap_o', name: 'Objective' },
    { field: 'soap_s', name: 'Subjective' },
    { field: 'client_education', name: 'Education' },
  ];
  
  for (const source of sources) {
    let text = consult[source.field];
    
    if (!text || typeof text !== 'string') continue;
    
    // Parse case_notes JSON if applicable
    if (source.field === 'case_notes') {
      text = parseCaseNotesText(text);
    }
    
    if (text.trim()) {
      const found = extractFromText(text, source.name);
      allMedications.push(...found);
    }
  }
  
  // Deduplicate and return
  return deduplicateMedications(allMedications);
}

/**
 * Get just the medication names (for simple dropdown display)
 */
export function getMedicationNames(consult: ConsultTextSources): string[] {
  const medications = extractMedicationsFromConsult(consult);
  return medications.map(m => m.name);
}
