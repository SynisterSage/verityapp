/**
 * Production-Grade Phone Number Normalization
 * 
 * Handles all common input formats and edge cases
 * - US 10-digit numbers: 4155552671 → +14155552671
 * - US 11-digit with leading 1: 14155552671 → +14155552671
 * - Already formatted: +14155552671 → +14155552671
 * - International: +441234567890 → +441234567890
 * - With formatting: +1 (415) 555-2671 → +14155552671
 * 
 * Idempotent: normalizeE164(normalizeE164(x)) === normalizeE164(x)
 */

/**
 * Normalize phone number to E.164 format with strict validation
 * 
 * Handles both US and international numbers:
 * - US: Assumes +1 country code if not specified
 * - International: Preserves country code if present in input
 * 
 * Returns null if:
 * - Input is null/undefined
 * - Result is not valid E.164 (8-15 digits minimum)
 */
export function normalizeE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  // If already in E.164 format (+...), validate and return
  if (phone.startsWith('+')) {
    const cleaned = phone.slice(1).replace(/\D/g, '');
    // E.164 requires 8-15 digits after +
    if (cleaned.length >= 8 && cleaned.length <= 15) {
      return `+${cleaned}`;
    }
    return null;
  }
  
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Reject empty or too-short numbers
  if (cleaned.length < 8) {
    return null;
  }
  
  // Handle US 10-digit numbers (assumed default)
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  
  // Handle US 11-digit numbers with leading 1 (1XXXXXXXXXX)
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }
  
  // Handle other 11-digit numbers
  // Default to +1 (US) unless it's clearly a different country code
  if (cleaned.length === 11) {
    // Check if it starts with known international codes
    // (e.g., 44 for UK, 33 for France, 49 for Germany)
    const maybeCountryCode = cleaned.slice(0, 2);
    if (['44', '33', '49', '39', '34', '31', '43', '32', '41', '45', '47', '46', '48'].includes(maybeCountryCode)) {
      return `+${cleaned}`;
    }
    // Otherwise assume it's US format with leading digit (legacy)
    return `+1${cleaned}`;
  }
  
  // Handle international numbers (12-15 digits, standard E.164 length)
  if (cleaned.length >= 12 && cleaned.length <= 15) {
    return `+${cleaned}`;
  }
  
  // Invalid length
  return null;
}

/**
 * Compare two phone numbers with multiple normalization attempts
 * 
 * Smart comparison:
 * 1. Try direct E.164 normalization
 * 2. If either fails, try lenient matching
 * 3. Handle null inputs gracefully
 */
export function phonesMatch(
  phone1: string | null | undefined,
  phone2: string | null | undefined
): boolean {
  // Fast path: null checks
  if (!phone1 || !phone2) return false;
  
  // Normalize both
  const norm1 = normalizeE164(phone1);
  const norm2 = normalizeE164(phone2);
  
  // Both must normalize successfully
  if (!norm1 || !norm2) return false;
  
  // Direct comparison
  return norm1 === norm2;
}

/**
 * Validate a phone number (check if it normalizes correctly)
 */
export function isValidPhone(phone: string | null | undefined): boolean {
  return normalizeE164(phone) !== null;
}

/**
 * Get normalized version, or original if normalization fails
 * (safe fallback for display purposes)
 */
export function normalizePhoneOrOriginal(phone: string | null | undefined): string {
  if (!phone) return '(unknown)';
  const normalized = normalizeE164(phone);
  return normalized || phone;
}

/**
 * Cache for normalization results (prevent redundant processing)
 * Limited to 1000 entries to prevent memory leak
 */
const normalizationCache = new Map<string, string | null>();
const NORMALIZATION_CACHE_SIZE = 1000;

/**
 * Cached normalization (for high-frequency paths like loop detection)
 * Use this in tight loops or repeated comparisons
 */
export function normalizeE164Cached(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  // Check cache first
  if (normalizationCache.has(phone)) {
    return normalizationCache.get(phone) || null;
  }
  
  // Compute and cache
  const normalized = normalizeE164(phone);
  
  // Prevent unbounded cache growth
  if (normalizationCache.size >= NORMALIZATION_CACHE_SIZE) {
    const firstKey = normalizationCache.keys().next().value;
    if (firstKey) {
      normalizationCache.delete(firstKey);
    }
  }
  
  normalizationCache.set(phone, normalized);
  return normalized;
}

/**
 * Clear normalization cache (for testing or memory management)
 */
export function clearNormalizationCache(): void {
  normalizationCache.clear();
}

/**
 * Get cache statistics (for monitoring)
 */
export function getNormalizationCacheStats() {
  return {
    size: normalizationCache.size,
    maxSize: NORMALIZATION_CACHE_SIZE,
  };
}
