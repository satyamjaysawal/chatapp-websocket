
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,html}",
  ],
  theme: {
    extend: {
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'bounce-subtle': 'bounce 1s ease-in-out',
        'fade-in-right': 'fadeInRight 0.5s ease-out forwards',
        'rotate-in': 'rotateIn 0.3s ease-out forwards',
      },
      keyframes: {
        fadeInRight: {
          '0%': {
            opacity: '0',
            transform: 'translateX(10px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateX(0)',
          },
        },
        rotateIn: {
          '0%': {
            transform: 'rotate(-90deg)',
            opacity: '0',
          },
          '100%': {
            transform: 'rotate(0)',
            opacity: '1',
          },
        },
      },
    },
  },
  plugins: [],
};
