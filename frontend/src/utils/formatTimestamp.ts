export type FormatTimestampOptions = {
  locale?: string;
  fallback?: string;
  formatterOptions?: Intl.DateTimeFormatOptions;
};

const DEFAULT_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
};

function createFormatter(locale?: string, overrides?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale ?? undefined, {
    ...DEFAULT_FORMAT_OPTIONS,
    ...overrides,
  });
}

export function formatTimestamp(
  value: string | number | Date | undefined | null,
  options: FormatTimestampOptions = {}
) {
  const fallback = options.fallback ?? '—';
  if (value === undefined || value === null) {
    return fallback;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  const formatter = createFormatter(options.locale, options.formatterOptions);
  return formatter.format(date);
}
