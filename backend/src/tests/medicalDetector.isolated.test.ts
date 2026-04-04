/**
 * Isolated unit tests for medical office detection (CNAM keyword matching)
 * No database dependencies
 */

interface MedicalDetectionResult {
  isMedical: boolean;
  category?: string;
  confidence: 'high' | 'medium' | 'not-medical';
  shouldPromptVerification: boolean;
}

// Copy of the detector logic for testing
const MEDICAL_KEYWORDS = [
  'HOSPITAL', 'CHILDREN\'S', 'MEDICAL CENTER', 'CLINICAL', 'CLINIC',
  'DOCTOR', 'DR.', 'DR ', 'PHYSICIAN', 'MD', 'DDS', 'DVM',
  'MEDICAL OFFICE', 'DENTAL OFFICE', 'HEALTH CENTER', 'CARE CENTER',
  'SURGERY CENTER', 'SURGICAL CENTER',
  'URGENT CARE', 'EMERGENCY', 'ER ', 'E.R.',
  'DENTAL', 'DENTISTRY', 'ORTHODONT',
  'PHARMACY', 'PHARMACIST', 'APOTHECARY',
  'NURSING HOME', 'REHAB', 'REHABILITATION', 'THERAPY',
  'LABORATORY', 'LAB ', 'DIAGNOSTIC', 'PATHOLOGY',
  'PSYCHIATRY', 'PSYCHIATRIC', 'MENTAL HEALTH', 'PSYCHOTHERAPY',
  'VA ', 'VETERAN', 'PUBLIC HEALTH',
  'HEALTHCARE', 'HEALTH CARE', 'MEDICAL GROUP',
];

const MEDICAL_KEYWORDS_PATTERN = new RegExp(
  `\\b(${MEDICAL_KEYWORDS.join('|')})\\b`,
  'gi'
);

const FALSE_POSITIVE_KEYWORDS = [
  'MEDICAL SUPPLY', 'MEDICAL EQUIPMENT', 'MEDICAL BILLING', 'MEDICAL RECORDS',
  'MEDICAL ALERT', 'MEDICAL INSURANCE', 'MEDICAL CONFERENCE', 'MEDICAL SCHOOL',
  'MEDICAL UNIVERSITY', 'MEDICAL DEVICE', 'MEDICAL TECHNOLOGY',
];

const FALSE_POSITIVE_PATTERN = new RegExp(
  `\\b(${FALSE_POSITIVE_KEYWORDS.join('|')})\\b`,
  'gi'
);

function detectMedicalFromCNAM(cnam: string | null | undefined): MedicalDetectionResult {
  if (!cnam || typeof cnam !== 'string') {
    return {
      isMedical: false,
      confidence: 'not-medical',
      shouldPromptVerification: false,
    };
  }

  const upperCNAM = cnam.toUpperCase().trim();

  // Quick reject if false positive keyword present
  if (FALSE_POSITIVE_PATTERN.test(upperCNAM)) {
    return {
      isMedical: false,
      confidence: 'not-medical',
      shouldPromptVerification: false,
    };
  }

  // Look for medical keywords
  const matches = upperCNAM.match(MEDICAL_KEYWORDS_PATTERN);
  if (!matches || matches.length === 0) {
    return {
      isMedical: false,
      confidence: 'not-medical',
      shouldPromptVerification: false,
    };
  }

  // Determine confidence
  const highConfidenceKeywords = [
    'HOSPITAL', 'CLINIC', 'MEDICAL CENTER', 'URGENT CARE',
    'DOCTOR', 'DR.', 'DR ', 'PHYSICIAN', 'DENTAL',
  ];
  const hasHighConfidence = matches.some((m) =>
    highConfidenceKeywords.some(
      (k) => m.indexOf(k) !== -1 || k.indexOf(m) !== -1
    )
  );

  const confidence = hasHighConfidence ? 'high' : 'medium';

  // Extract category
  let category;
  if (upperCNAM.includes('HOSPITAL')) {
    category = 'Hospital';
  } else if (upperCNAM.includes('URGENT CARE') || upperCNAM.includes('URGENT-CARE')) {
    category = 'Urgent Care';
  } else if (upperCNAM.includes('DENTAL') || upperCNAM.includes('ORTHODONT')) {
    category = 'Dental';
  } else if (upperCNAM.includes('PHARMACY') || upperCNAM.includes('PHARMACIST')) {
    category = 'Pharmacy';
  } else if (upperCNAM.includes('CLINIC') || upperCNAM.includes('MEDICAL CENTER')) {
    category = 'Clinic';
  } else if (upperCNAM.includes('NURSING')) {
    category = 'Nursing Home';
  } else if (upperCNAM.includes('THERAPY') || upperCNAM.includes('REHAB')) {
    category = 'Rehabilitation';
  } else if (upperCNAM.includes('PSYCHIATR') || upperCNAM.includes('MENTAL HEALTH')) {
    category = 'Mental Health';
  } else {
    category = 'Medical Office';
  }

  return {
    isMedical: true,
    confidence,
    category,
    shouldPromptVerification: confidence === 'high',
  };
}

// Test cases
const testCases = [
  // High confidence hospitals
  { cnam: 'KAISER HOSPITAL SF', expectedConfidence: 'high', expectedMedical: true },
  { cnam: 'UCSF MEDICAL CENTER', expectedConfidence: 'high', expectedMedical: true },
  { cnam: 'CHILDREN\'S HOSPITAL LA', expectedConfidence: 'high', expectedMedical: true },

  // High confidence urgent care
  { cnam: 'URGENT CARE CLINIC 24', expectedConfidence: 'high', expectedMedical: true },
  { cnam: 'AFTER HOURS URGENT CARE', expectedConfidence: 'high', expectedMedical: true },

  // High confidence doctors
  { cnam: 'DR SMITH FAMILY CLINIC', expectedConfidence: 'high', expectedMedical: true },
  { cnam: 'JOHN PHYSICIAN MD', expectedConfidence: 'high', expectedMedical: true },

  // High confidence dental (DENTAL is in high-confidence list)
  { cnam: 'SUNSET DENTAL OFFICE', expectedConfidence: 'high', expectedMedical: true },
  { cnam: 'JOHN DENTAL LLC', expectedConfidence: 'high', expectedMedical: true },

  // Medium confidence pharmacy
  { cnam: 'CVS PHARMACY 5412', expectedConfidence: 'medium', expectedMedical: true },
  { cnam: 'WALGREENS PHARMACY', expectedConfidence: 'medium', expectedMedical: true },

  // False positives (should NOT detect as medical)
  { cnam: 'MEDICAL ALERT SYSTEMS INC', expectedConfidence: 'not-medical', expectedMedical: false },
  { cnam: 'MEDICAL DEVICES CORP', expectedConfidence: 'not-medical', expectedMedical: false },
  { cnam: 'MEDICAL BILLING SERVICE', expectedConfidence: 'not-medical', expectedMedical: false },
  { cnam: 'MEDICAL SCHOOL OF SF', expectedConfidence: 'not-medical', expectedMedical: false },

  // Non-medical businesses
  { cnam: 'PIZZA HUT', expectedConfidence: 'not-medical', expectedMedical: false },
  { cnam: 'APPLE INC', expectedConfidence: 'not-medical', expectedMedical: false },
  { cnam: 'STARBUCKS COFFEE', expectedConfidence: 'not-medical', expectedMedical: false },

  // Edge cases
  { cnam: null, expectedConfidence: 'not-medical', expectedMedical: false },
  { cnam: '', expectedConfidence: 'not-medical', expectedMedical: false },
  { cnam: '   ', expectedConfidence: 'not-medical', expectedMedical: false },
];

console.log('\n=== Medical Office Detection Test Suite ===\n');
console.log('Testing CNAM keyword-based detection\n');

let passed = 0;
let failed = 0;

for (const test of testCases) {
  const result = detectMedicalFromCNAM(test.cnam);
  const confPass = result.confidence === test.expectedConfidence;
  const medicalPass = result.isMedical === test.expectedMedical;
  const passed_test = confPass && medicalPass;

  if (passed_test) {
    passed++;
    console.log(`✓ "${test.cnam}"`);
  } else {
    failed++;
    console.log(`✗ "${test.cnam}"`);
    if (!confPass) {
      console.log(`  Expected confidence: ${test.expectedConfidence}, got: ${result.confidence}`);
    }
    if (!medicalPass) {
      console.log(`  Expected medical: ${test.expectedMedical}, got: ${result.isMedical}`);
    }
  }
  console.log(`  → confidence=${result.confidence} isMedical=${result.isMedical} category=${result.category || 'none'}`);
}

console.log(`\n=== Results ===`);
console.log(`Passed: ${passed}/${testCases.length}`);
console.log(`Failed: ${failed}/${testCases.length}\n`);

if (failed > 0) {
  process.exit(1);
}
