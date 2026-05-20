import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/assets/erpnext_npdi_suite/frontend/',
  plugins: [react()],
  build: {
    outDir: '../erpnext_npdi_suite/public/frontend',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: `bundle.js`,
        chunkFileNames: `bundle.js`,
        assetFileNames: `[name].[ext]`
      }
    }
  }
})
