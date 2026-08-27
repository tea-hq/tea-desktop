import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

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
    bodySize: '0.875rem',
    bodyLineHeight: '1.5',
    sansFamily: "'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', system-ui, sans-serif",
    monoFamily: "'JetBrains Mono Variable', 'Cascadia Code', Menlo, monospace",
  },
  control: {
    compactHeight: '2rem',
    defaultHeight: '2.25rem',
    primaryHeight: '2.5rem',
  },
  radius: {
    control: '0.375rem',
    overlay: '0.5rem',
    structural: '0.125rem',
  },
  focus: {
    color: '#0f6cbd',
    offset: '2px',
    width: '2px',
  },
  status: {
    danger: '#c50f1f',
    info: '#0f6cbd',
    success: '#107c10',
    warning: '#8a4b08',
  },
  surface: {
    canvas: '#ffffff',
    subtle: '#f5f5f5',
    muted: '#eeeeee',
    elevated: '#ffffff',
  },
  elevation: {
    overlay: '0 8px 24px rgba(0, 0, 0, 0.14)',
  },
} as const

export const TeaPreset = definePreset(Aura, {
  primitive: {
    borderRadius: {
      none: '0',
      xs: teaDesignTokens.radius.structural,
      sm: '0.25rem',
      md: teaDesignTokens.radius.control,
      lg: teaDesignTokens.radius.overlay,
      xl: teaDesignTokens.radius.overlay,
    },
  },
  semantic: {
    typography: {
      fontFamily: teaDesignTokens.typography.sansFamily,
      fontSize: teaDesignTokens.typography.bodySize,
      fontWeight: '400',
      lineHeight: teaDesignTokens.typography.bodyLineHeight,
    },
    transitionDuration: '120ms',
    focusRing: {
      width: teaDesignTokens.focus.width,
      style: 'solid',
      color: teaDesignTokens.focus.color,
      offset: teaDesignTokens.focus.offset,
      shadow: 'none',
    },
    primary: {
      50: '#eff6fc',
      100: '#deecf9',
      200: '#c7e0f4',
      300: '#71afe5',
      400: '#2b88d8',
      500: '#0f6cbd',
      600: '#115ea3',
      700: '#0c3b5e',
      800: '#092c47',
      900: '#061f33',
      950: '#03131f',
      color: teaDesignTokens.focus.color,
      contrastColor: '#ffffff',
      hoverColor: '#115ea3',
      activeColor: '#0c3b5e',
    },
    formField: {
      fontSize: teaDesignTokens.typography.bodySize,
      paddingX: '0.625rem',
      paddingY: '0.3125rem',
      sm: {
        fontSize: '0.8125rem',
        paddingX: '0.5rem',
        paddingY: '0.1875rem',
      },
      borderRadius: teaDesignTokens.radius.control,
      focusRing: {
        width: teaDesignTokens.focus.width,
        style: 'solid',
        color: teaDesignTokens.focus.color,
        offset: '0',
        shadow: 'none',
      },
      shadow: 'none',
    },
    content: {
      borderRadius: teaDesignTokens.radius.control,
    },
    overlay: {
      select: {
        borderRadius: teaDesignTokens.radius.overlay,
        shadow: teaDesignTokens.elevation.overlay,
      },
      popover: {
        borderRadius: teaDesignTokens.radius.overlay,
        shadow: teaDesignTokens.elevation.overlay,
      },
      modal: {
        borderRadius: teaDesignTokens.radius.overlay,
        shadow: teaDesignTokens.elevation.overlay,
      },
      navigation: {
        shadow: teaDesignTokens.elevation.overlay,
      },
    },
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#eeeeee',
          300: '#e0e0e0',
          400: '#bdbdbd',
          500: '#8a8a8a',
          600: '#616161',
          700: '#424242',
          800: '#292929',
          900: '#1f1f1f',
          950: '#141414',
        },
        text: {
          color: '#242424',
          hoverColor: '#1f1f1f',
          mutedColor: '#616161',
          hoverMutedColor: '#424242',
        },
      },
    },
  },
  components: {
    button: {
      root: {
        borderRadius: '{tea.radius.control}',
        fontSize: teaDesignTokens.typography.bodySize,
        iconOnlyWidth: teaDesignTokens.control.defaultHeight,
        paddingX: '0.75rem',
        paddingY: '0.4375rem',
        raisedShadow: 'none',
        sm: {
          fontSize: '0.8125rem',
          iconOnlyWidth: teaDesignTokens.control.compactHeight,
          paddingX: '0.625rem',
          paddingY: '0.3125rem',
        },
      },
    },
  },
  extend: {
    tea: teaDesignTokens,
  },
})
