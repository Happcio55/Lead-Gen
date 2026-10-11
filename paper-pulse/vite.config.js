import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' so the build works from any sub-path (GitHub Pages, Vercel, Netlify)
export default defineConfig({
  base: './',
  plugins: [react()],
})
