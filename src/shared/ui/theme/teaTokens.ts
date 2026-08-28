export const teaDesignTokens = {
  spacing: {
    base: '0.25rem',
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    5: '1.25rem',
    6: '1.5rem',
  },
  typography: {
    bodySize: '0.9375rem',
    bodyLineHeight: '1.5',
    sansFamily:
      "'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', system-ui, sans-serif",
    monoFamily: "'JetBrains Mono Variable', 'Cascadia Code', Menlo, monospace",
  },
  control: {
    compactHeight: '2rem',
    defaultHeight: '2.25rem',
    primaryHeight: '2.5rem',
  },
  radius: {
    structural: '8px',
    control: '12px',
    overlay: '16px',
  },
  colors: {
    accent: '#4f9d35',
    danger: '#c43d46',
    success: '#4f9d35',
    warning: '#a26a16',
    canvas: '#ffffff',
    surface: '#fbfbfb',
    panel: '#f6f6f6',
    line: '#e4e4e4',
  },
  elevation: {
    overlay: '0 8px 24px rgb(0 0 0 / 10%)',
  },
} as const
