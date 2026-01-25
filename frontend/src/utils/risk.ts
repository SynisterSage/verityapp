import { tokens } from '../theme/tokens';
import { withOpacity } from './color';

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical' | 'unknown';

type RiskPalette = {
  [key in RiskSeverity]: {
    text: string;
    background: string;
    accent: string;
  };
};

const { success, warning, danger, accent } = tokens.colors.dark;

const RISK_PALETTE: RiskPalette = {
  critical: {
    text: '#ffecec',
    background: withOpacity(danger, 0.3),
    accent: danger,
  },
  high: {
    text: '#fff8e1',
    background: withOpacity(warning, 0.3),
    accent: warning,
  },
  medium: {
    text: '#1f1b0d',
    background: withOpacity(warning, 0.25),
    accent: warning,
  },
  low: {
    text: '#dff9ec',
    background: withOpacity(success, 0.26),
    accent: success,
  },
  unknown: {
    text: '#e6effc',
    background: withOpacity(accent, 0.18),
    accent,
  },
};

function normalizeLevel(level?: string | null): RiskSeverity {
  if (!level) {
    return 'unknown';
  }
  const normalized = level.toLowerCase();
  if (normalized.includes('critical')) {
    return 'critical';
  }
  if (normalized.includes('high')) {
    return 'high';
  }
  if (normalized.includes('medium')) {
    return 'medium';
  }
  if (normalized.includes('low')) {
    return 'low';
  }
  return 'unknown';
}

export function getRiskStyles(level?: string | null) {
  const severity = normalizeLevel(level);
  return RISK_PALETTE[severity];
}

export function getRiskSeverity(level?: string | null) {
  return normalizeLevel(level);
}
