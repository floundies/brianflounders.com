import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        shore: path.resolve(__dirname, 'shore/index.html'),
      },
    },
  },
  plugins: [
    {
      name: 'static-subdirs',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split('?')[0] || ''

          // Redirect /junto and /theater to trailing slash
          if (url === '/junto' || url === '/theater') {
            res.writeHead(302, { Location: url + '/' })
            res.end()
            return
          }

          if (url.startsWith('/junto/') || url.startsWith('/theater/')) {
            let filePath = url
            if (filePath.endsWith('/')) filePath += 'index.html'

            const abs = path.join(process.cwd(), 'public', filePath)
            if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
              const ext = path.extname(abs)
              const types: Record<string, string> = {
                '.html': 'text/html; charset=utf-8',
                '.css': 'text/css',
                '.js': 'application/javascript',
                '.svg': 'image/svg+xml',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.ico': 'image/x-icon',
                '.webp': 'image/webp',
              }
              res.setHeader('Content-Type', types[ext] || 'application/octet-stream')
              fs.createReadStream(abs).pipe(res)
              return
            }
          }

          next()
        })
      }
    },
    react(),
  ],
})
