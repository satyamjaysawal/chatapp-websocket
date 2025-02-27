// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// // https://vite.dev/config/
// export default defineConfig({
//   plugins: [react()],
// })


// import { defineConfig } from 'vite';
// import react from '@vitejs/plugin-react';

// export default defineConfig({
//   plugins: [react()],
//   server: {
//     port: 5173,
//   },
//   build: {
//     outDir: 'dist',
//   },
//   resolve: {
//     alias: {
//       '@': '/src',
//     },
//   },
//   base: '/',
// });



// import { defineConfig } from 'vite';
// import react from '@vitejs/plugin-react';

// export default defineConfig({
//   plugins: [react()],
//   resolve: {
//     alias: {
//       '@': '/src',
//     },
//   },
// });


import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    routes: {
      "/*": "index.html" // ✅ Serve `index.html` for all unknown routes (Fixes 404 issue on reload)
    },
  },
  base: "/",
});

// import { defineConfig } from 'vite';
// import react from '@vitejs/plugin-react';

// export default defineConfig({
//   plugins: [react()],
//   resolve: {
//     alias: {
//       '@': '/src',
//     },
//   },
//   server: {
//     port: 5173,
//     open: true,
//     strictPort: true,
//   },
//   build: {
//     outDir: "dist",
//   },
//   base: "/", // ✅ Correct base path
// });

