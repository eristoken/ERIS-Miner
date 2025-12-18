import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  base: './',
  define: {
    'import.meta.env.APP_VERSION': JSON.stringify(packageJson.version),
    'import.meta.env.APP_NAME': JSON.stringify(packageJson.name),
    'import.meta.env.APP_DESCRIPTION': JSON.stringify(packageJson.description),
    'import.meta.env.APP_LICENSE': JSON.stringify(packageJson.license),
  },
})

