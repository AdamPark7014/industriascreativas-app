import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const flask = 'http://127.0.0.1:5000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Prefijos → Flask (QR, correos, registro, confirmación, escáner)
      '/api': flask,
      '/registro_alumno': flask,
      '/registro_empresario': flask,
      '/registro_eventlisa': flask,
      '/escanear': flask,
      '/confirmar': flask,
      '/confirmar_generico': flask,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
