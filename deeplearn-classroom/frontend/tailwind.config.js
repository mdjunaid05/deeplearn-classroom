/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        white: '#ffffff',
        black: '#131b2e',
        'true-white': '#ffffff',
        primary: {
          50: '#acedff',
          100: '#cffafe',
          200: '#80d5cb',
          300: '#4cd7f6',
          400: '#06b6d4',
          500: '#00687a',
          600: '#005a6b',
          700: '#004e5c',
          800: '#00424f',
          900: '#001f26',
          950: '#001f26',
        },
        accent: {
          50: '#faf8ff',
          100: '#f2f3ff',
          200: '#eaedff',
          300: '#dae2fd',
          400: '#9cf2e8',
          500: '#006a63',
          600: '#00504a',
          700: '#00201d',
          800: '#191c1e',
          900: '#131b2e',
        },
        surface: {
          50: '#09090b', // dark background fallback
          100: '#0c0c0f', // dark container
          200: '#1e1e24', // dark border/secondary
          700: '#bcc9cd', // outline variant
          800: '#f2f3ff', // surface-container-low
          900: '#faf8ff', // surface background
        },
        nexus: {
          primary: '#00687a',
          'primary-container': '#06b6d4',
          'primary-fixed': '#acedff',
          'primary-fixed-dim': '#4cd7f6',
          'on-primary': '#ffffff',
          'on-primary-container': '#00424f',
          'on-primary-fixed': '#001f26',
          'on-primary-fixed-variant': '#004e5c',
          'inverse-primary': '#4cd7f6',
          secondary: '#006a63',
          'secondary-container': '#99efe5',
          'secondary-fixed': '#9cf2e8',
          'secondary-fixed-dim': '#80d5cb',
          'on-secondary': '#ffffff',
          'on-secondary-container': '#006f67',
          'on-secondary-fixed': '#00201d',
          'on-secondary-fixed-variant': '#00504a',
          tertiary: '#5c5f61',
          'tertiary-container': '#a4a7a9',
          'tertiary-fixed': '#e0e3e5',
          'tertiary-fixed-dim': '#c4c7c9',
          'on-tertiary': '#ffffff',
          'on-tertiary-container': '#393d3e',
          'on-tertiary-fixed': '#191c1e',
          'on-tertiary-fixed-variant': '#444749',
          background: '#faf8ff',
          'on-background': '#131b2e',
          surface: '#faf8ff',
          'surface-dim': '#d2d9f4',
          'surface-bright': '#faf8ff',
          'surface-container': '#eaedff',
          'surface-container-lowest': '#ffffff',
          'surface-container-low': '#f2f3ff',
          'surface-container-high': '#e2e7ff',
          'surface-container-highest': '#dae2fd',
          'surface-variant': '#dae2fd',
          'on-surface': '#131b2e',
          'on-surface-variant': '#3d494c',
          'inverse-surface': '#283044',
          'inverse-on-surface': '#eef0ff',
          'surface-tint': '#00687a',
          error: '#ba1a1a',
          'error-container': '#ffdad6',
          'on-error': '#ffffff',
          'on-error-container': '#93000a',
          outline: '#6d797d',
          'outline-variant': '#bcc9cd',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Outfit', 'Inter', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-left': 'slideInLeft 0.4s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(99, 102, 241, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(99, 102, 241, 0.6)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
