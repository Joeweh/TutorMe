import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        allowedHosts: [
          'barriers-website-minute-ontario.trycloudflare.com'
        ],
        port: 3000,
    },
})