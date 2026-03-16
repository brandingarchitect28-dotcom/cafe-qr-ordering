// Theme configurations for café ordering pages

export const themes = {
  luxury: {
    name: 'Luxury Café',
    colors: {
      background: '#050505',
      surface: '#0F0F0F',
      primary: '#D4AF37',
      secondary: '#C5A059',
      text: '#F5F5F5',
      textSecondary: '#A3A3A3',
      accent: '#E5C576',
      overlay: 'rgba(0, 0, 0, 0.6)'
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Manrope', sans-serif"
    },
    styles: {
      borderRadius: '4px',
      cardShadow: '0 8px 32px rgba(212, 175, 55, 0.1)',
      cardHoverShadow: '0 12px 48px rgba(212, 175, 55, 0.2)',
      glassmorphism: true,
      backdropBlur: '12px'
    },
    animations: {
      cardHover: { y: -8, scale: 1.02 },
      buttonHover: { scale: 1.05 },
      duration: 0.3
    }
  },

  minimal: {
    name: 'Modern Minimal',
    colors: {
      background: '#FFFFFF',
      surface: '#F8F8F8',
      primary: '#FF6B3D',
      secondary: '#FF8C6B',
      text: '#222222',
      textSecondary: '#666666',
      accent: '#FFB199',
      overlay: 'rgba(255, 255, 255, 0.95)'
    },
    fonts: {
      heading: "'Inter', sans-serif",
      body: "'Inter', sans-serif"
    },
    styles: {
      borderRadius: '16px',
      cardShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
      cardHoverShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
      glassmorphism: false,
      backdropBlur: '0px'
    },
    animations: {
      cardHover: { y: -6, scale: 1.01 },
      buttonHover: { scale: 1.03 },
      duration: 0.25
    }
  },

  street: {
    name: 'Street Café',
    colors: {
      background: '#FFF6E5',
      surface: '#FFFFFF',
      primary: '#FF6B00',
      secondary: '#FFB703',
      text: '#2B2B2B',
      textSecondary: '#5C5C5C',
      accent: '#FFDD00',
      overlay: 'rgba(255, 246, 229, 0.95)'
    },
    fonts: {
      heading: "'Bebas Neue', sans-serif",
      body: "'Poppins', sans-serif"
    },
    styles: {
      borderRadius: '12px',
      cardShadow: '0 4px 16px rgba(255, 107, 0, 0.15)',
      cardHoverShadow: '0 8px 32px rgba(255, 107, 0, 0.25)',
      glassmorphism: false,
      backdropBlur: '0px'
    },
    animations: {
      cardHover: { y: -8, scale: 1.03, rotate: -1 },
      buttonHover: { scale: 1.08 },
      duration: 0.35
    }
  }
};

export const getTheme = (themeStyle) => {
  return themes[themeStyle] || themes.luxury;
};

/**
 * Get a theme, overriding colors for dark vs light mode.
 * @param {string} themeStyle   - 'luxury' | 'minimal' | 'street'
 * @param {string} mode         - 'dark' | 'light'
 * @param {string} primaryColor - optional hex override from cafe settings
 */
export const getThemedColors = (themeStyle, mode = 'dark', primaryColor = null) => {
  const base = themes[themeStyle] || themes.luxury;
  const isDark = mode === 'dark';

  const modeColors = isDark
    ? {
        background:    '#050505',
        surface:       '#0F0F0F',
        card:          '#151515',
        text:          '#F5F5F5',
        textSecondary: '#A3A3A3',
        border:        'rgba(255,255,255,0.08)',
        overlay:       'rgba(0,0,0,0.6)',
        inputBg:       'rgba(255,255,255,0.05)',
        inputBorder:   'rgba(255,255,255,0.12)',
      }
    : {
        background:    '#FFFFFF',
        surface:       '#F5F5F5',
        card:          '#FFFFFF',
        text:          '#111111',
        textSecondary: '#555555',
        border:        'rgba(0,0,0,0.10)',
        overlay:       'rgba(255,255,255,0.95)',
        inputBg:       'rgba(0,0,0,0.04)',
        inputBorder:   'rgba(0,0,0,0.15)',
      };

  return {
    ...base,
    colors: {
      ...base.colors,
      ...modeColors,
      primary:   primaryColor || base.colors.primary,
      secondary: primaryColor || base.colors.secondary,
      accent:    primaryColor || base.colors.accent,
    },
  };
};
