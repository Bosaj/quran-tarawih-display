// Runs the built app on the mosque's network so a phone can act as a remote control.
//   npm run build && npm run lan
// Serves dist/ and relays messages between pages over a WebSocket at /link. Nothing leaves the network.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { extname, join, normalize, sep } from 'node:path'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.PORT ?? 8787)
const ROOT = join(process.cwd(), 'dist')
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm' }

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error('dist/ is missing: run "npm run build" first.')
  process.exit(1)
}

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (path === '/lan.json') {
    res.setHeader('content-type', 'application/json')
    res.end('{"lan":true}')
    return
  }
  const file = normalize(join(ROOT, path === '/' ? 'index.html' : path))
  if (!file.startsWith(ROOT + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.statusCode = 404
    res.end('Not found')
    return
  }
  res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream')
  createReadStream(file).pipe(res)
})

const wss = new WebSocketServer({ server, path: '/link', maxPayload: 64 * 1024 })
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    for (const peer of wss.clients) if (peer !== ws && peer.readyState === 1) peer.send(data.toString())
  })
})

server.listen(PORT, () => {
  console.log(`Technician (on this computer, for the microphone): http://localhost:${PORT}/`)
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`Phone remote: http://${a.address}:${PORT}/#/remote`)
    }
  }
})
