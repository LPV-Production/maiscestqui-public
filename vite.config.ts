import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En dev, `npm run dev` sert l'interface et redirige /api vers `npm run api` (wrangler).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8788' }
  }
})
