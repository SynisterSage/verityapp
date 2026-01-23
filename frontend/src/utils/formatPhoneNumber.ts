export function formatPhoneNumber(raw?: string | null, fallback = 'Recent Call') {
  if (!raw) {
    return fallback;
  }

  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) {
    return raw;
  }

  const countryCodeLength = Math.max(0, digits.length - 10);
  const countryCode = countryCodeLength > 0 ? `+${digits.slice(0, countryCodeLength)} ` : '';
  const national = digits.slice(countryCodeLength);
  const area = national.slice(0, 3);
  const prefix = national.slice(3, 6);
  const line = national.slice(6, 10);

  if (!line) {
    return `${countryCode}(${area})`;
  }

  return `${countryCode}(${area}) ${prefix}-${line}`;
}
