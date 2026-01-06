export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical' | 'unknown';

type RiskPalette = {
  [key in RiskSeverity]: {
    text: string;
    background: string;
    accent: string;
  };
};

const RISK_PALETTE: RiskPalette = {
  critical: {
    text: '#ffecec',
    background: 'rgba(255, 107, 107, 0.25)',
    accent: '#ff6b6b',
  },
  high: {
    text: '#fff3e2',
    background: 'rgba(255, 149, 92, 0.25)',
    accent: '#ff955c',
  },
  medium: {
    text: '#fff9e3',
    background: 'rgba(242, 193, 78, 0.25)',
    accent: '#f2c14e',
  },
  low: {
    text: '#d2ddf0',
    background: 'rgba(138, 180, 255, 0.2)',
    accent: '#8ab4ff',
  },
  unknown: {
    text: '#e6effc',
    background: 'rgba(94, 125, 172, 0.22)',
    accent: '#7c8cb9',
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
