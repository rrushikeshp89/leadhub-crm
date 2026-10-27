import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: app releases do not invalidate the cached libraries
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\/]node_modules[\/](recharts|d3-|victory-vendor|decimal\.js-light|lodash)/.test(id)) return 'charts'
          if (id.includes('iconsax-react')) return 'icons'
          if (/[\/]node_modules[\/](react|react-dom|react-router|react-router-dom|@remix-run|scheduler)[\/]/.test(id)) return 'react'
        },
      },
    },
  },
})
