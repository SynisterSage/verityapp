import logger from 'jet-logger';

/**
 * Medical office detection via CNAM keyword matching
 * Phase 1 of Option B: Catches 60-70% of medical calls instantly
 * 
 * No external data required, works with standard Twilio CNAM data
 * Used to show verification badges + smart push notifications during incoming calls
 */

export interface MedicalDetectionResult {
  isMedical: boolean;
  category?: string; // e.g., 'Hospital', 'Clinic', 'Urgent Care', 'Pharmacy', 'Dental'
  confidence: 'high' | 'medium' | 'not-medical';
  shouldPromptVerification: boolean;
}

/**
 * CNAM keywords for medical office detection
 * Tuned for hospitals/clinics (high precision) and smaller practices (moderate recall)
 */
const MEDICAL_KEYWORDS = [
  // Hospitals & large facilities
  'HOSPITAL', 'CHILDREN\'S', 'MEDICAL CENTER', 'CLINICAL', 'CLINIC',
  // Doctors & practitioners
  'DOCTOR', 'DR.', 'DR ', 'PHYSICIAN', 'MD', 'DDS', 'DVM',
  // Offices & facilities
  'MEDICAL OFFICE', 'DENTAL OFFICE', 'HEALTH CENTER', 'CARE CENTER',
  'SURGERY CENTER', 'SURGICAL CENTER',
  // Urgent & emergency
  'URGENT CARE', 'EMERGENCY', 'ER ', 'E.R.',
  // Dental
  'DENTAL', 'DENTISTRY', 'ORTHODONT',
  // Pharmacy & healthcare
  'PHARMACY', 'PHARMACIST', 'APOTHECARY',
  // Nurses & therapy
  'NURSING HOME', 'REHAB', 'REHABILITATION', 'THERAPY',
  // Labs & diagnostic
  'LABORATORY', 'LAB ', 'DIAGNOSTIC', 'PATHOLOGY',
  // Mental health
  'PSYCHIATRY', 'PSYCHIATRIC', 'MENTAL HEALTH', 'PSYCHOTHERAPY',
  // Veterans & government
  'VA ', 'VETERAN', 'PUBLIC HEALTH',
  // Other
  'HEALTHCARE', 'HEALTH CARE', 'MEDICAL GROUP',
];

const MEDICAL_KEYWORDS_PATTERN = new RegExp(
  `\\b(${MEDICAL_KEYWORDS.join('|')})\\b`,
  'gi'
);

/**
 * Filter to reduce false positives
 * (words that look medical but are often businesses)
 */
const FALSE_POSITIVE_KEYWORDS = [
  'MEDICAL SUPPLY', 'MEDICAL EQUIPMENT', 'MEDICAL BILLING', 'MEDICAL RECORDS',
  'MEDICAL ALERT', 'MEDICAL INSURANCE', 'MEDICAL CONFERENCE', 'MEDICAL SCHOOL',
  'MEDICAL UNIVERSITY', 'MEDICAL DEVICE', 'MEDICAL TECHNOLOGY',
];

const FALSE_POSITIVE_PATTERN = new RegExp(
  `\\b(${FALSE_POSITIVE_KEYWORDS.join('|')})\\b`,
  'gi'
);

/**
 * Analyze CNAM text for medical keywords
 * Returns high/medium confidence if medical keywords found
 */
export function detectMedicalOffice(cnam: string | null | undefined): MedicalDetectionResult {
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

  // Determine confidence based on keyword strength
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

  // Extract category from keywords
  let category: string | undefined;
  if (upperCNAM.includes('HOSPITAL')) {
    category = 'Hospital';
  } else if (
    upperCNAM.includes('URGENT CARE') ||
    upperCNAM.includes('URGENT-CARE')
  ) {
    category = 'Urgent Care';
  } else if (
    upperCNAM.includes('DENTAL') ||
    upperCNAM.includes('ORTHODONT')
  ) {
    category = 'Dental';
  } else if (
    upperCNAM.includes('PHARMACY') ||
    upperCNAM.includes('PHARMACIST')
  ) {
    category = 'Pharmacy';
  } else if (
    upperCNAM.includes('CLINIC') ||
    upperCNAM.includes('MEDICAL CENTER')
  ) {
    category = 'Clinic';
  } else if (upperCNAM.includes('NURSING')) {
    category = 'Nursing Home';
  } else if (upperCNAM.includes('THERAPY') || upperCNAM.includes('REHAB')) {
    category = 'Rehabilitation';
  } else if (
    upperCNAM.includes('PSYCHIATR') ||
    upperCNAM.includes('MENTAL HEALTH')
  ) {
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


/**
 * Determine if user should see a verification prompt
 * (Don't nag too much, skip if already in trusted contacts)
 */
export function shouldShowVerificationPrompt(
  detection: MedicalDetectionResult,
  isInTrustedContacts: boolean
): boolean {
  if (isInTrustedContacts) {
    return false; // Already trusted, no need to verify again
  }
  return detection.shouldPromptVerification && detection.isMedical;
}
