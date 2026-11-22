/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Roboto', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        sabis: {
          green: '#016836',
          'green-dark': '#01522B',
          'green-light': '#046937',
          cream: '#F7F4F2',
          stone: '#E3DBD3',
          taupe: '#B6ADA4',
          muted: '#7B6E65',
          ink: '#26211E',
          blue: '#0080BB',
          sky: '#40B4E5',
          red: '#E53C2E',
          gold: '#8A6D3B',
        },
      },
    },
  },
  plugins: [],
};
