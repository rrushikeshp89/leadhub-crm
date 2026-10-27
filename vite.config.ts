import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
  build: {
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks: app releases do not invalidate the cached libraries
        codeSplitting: {
          groups: [
            { name: 'charts', test: /[\\/]node_modules[\\/](recharts|d3-|victory-vendor|decimal\.js-light|lodash)/ },
            { name: 'icons', test: /[\\/]node_modules[\\/]iconsax-react[\\/]/ },
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|cookie|set-cookie-parser)[\\/]/ },
          ],
        },
      },
    },
  },
})
