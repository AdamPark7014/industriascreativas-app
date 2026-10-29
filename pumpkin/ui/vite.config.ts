import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/pumpkin/',
  server: {
    proxy: { '/pumpkin/api': 'http://127.0.0.1:3090' },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
