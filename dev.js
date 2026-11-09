// Servidor local para probar sin Vercel: node dev.js  (usa memoria si no hay base conectada)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    const f = path.join(root, 'api', u.pathname.slice(5) + '.js');
    if (!fs.existsSync(f)) { res.statusCode = 404; return res.end('no'); }
    req.query = Object.fromEntries(u.searchParams);
    const mod = await import(pathToFileURL(f).href);
    return mod.default(req, res);
  }
  const rel = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
  const f = path.join(root, 'public', rel);
  if (!f.startsWith(path.join(root, 'public')) || !fs.existsSync(f)) { res.statusCode = 404; return res.end('no'); }
  res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
}).listen(3000, () => console.log('http://localhost:3000'));
