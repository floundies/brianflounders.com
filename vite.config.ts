import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  plugins: [
    {
      name: 'static-subdirs',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split('?')[0] || ''

          // Redirect /junto to /junto/ so relative paths resolve correctly
          if (url === '/junto') {
            res.writeHead(302, { Location: '/junto/' })
            res.end()
            return
          }

          if (url.startsWith('/junto/')) {
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
