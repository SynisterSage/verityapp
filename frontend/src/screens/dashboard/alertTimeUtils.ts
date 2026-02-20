const TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

const DATE_WITH_YEAR_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const DATE_WITHOUT_YEAR_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

export function parseAlertTimestamp(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hasTimeZone = /(z|[+-]\d{2}:\d{2})$/i.test(trimmed);
  const candidate = hasTimeZone ? trimmed : `${trimmed}Z`;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const formatAlertTime = (value: string) => {
  const parsed = parseAlertTimestamp(value);
  if (!parsed) return '';
  return TIME_FORMATTER.format(parsed);
};

export const formatAlertDateLabel = (value?: string | null) => {
  const date = parseAlertTimestamp(value);
  if (!date) return '';
  const now = new Date();
  const showYear = now.getFullYear() !== date.getFullYear();
  return showYear ? DATE_WITH_YEAR_FORMATTER.format(date) : DATE_WITHOUT_YEAR_FORMATTER.format(date);
};
