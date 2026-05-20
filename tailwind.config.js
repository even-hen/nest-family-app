/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#7C5CFC',
        accent: '#FF6B6B',
        success: '#4ECDC4',
        warning: '#FFB347',
        bg: '#0F0E1A',
        card: '#1A1828',
      },
    },
  },
  plugins: [],
};

