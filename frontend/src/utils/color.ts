export function withOpacity(hex: string, alpha: number) {
  if (!hex) {
    return `rgba(255,255,255,${alpha})`;
  }
  const normalized = hex.replace('#', '');
  const isShort = normalized.length === 3;
  const hexDigits = isShort
    ? normalized
        .split('')
        .map((char) => `${char}${char}`)
        .join('')
    : normalized;
  if (hexDigits.length !== 6) {
    return `rgba(255,255,255,${alpha})`;
  }
  const r = parseInt(hexDigits.slice(0, 2), 16);
  const g = parseInt(hexDigits.slice(2, 4), 16);
  const b = parseInt(hexDigits.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
