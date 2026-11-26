// 任意のローカルプレビュー。アプリ自体は index.html を開くだけでも動作します。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/styles.css': ['styles.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'], '/matching.js': ['matching.js', 'text/javascript'] };
Object.assign(files, { '/quest.css': ['quest.css', 'text/css'], '/quest-engine.js': ['quest-engine.js', 'text/javascript'], '/quest-ui.js': ['quest-ui.js', 'text/javascript'] });
Object.assign(files, { '/team.css': ['team.css', 'text/css'], '/team-ui.js': ['team-ui.js', 'text/javascript'] });
const server = http.createServer((req, res) => {
  const entry = files[new URL(req.url, 'http://localhost').pathname];
  if (!entry) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(path.join(__dirname, entry[0]), (error, bytes) => {
    if (error) { res.writeHead(500); return res.end('File unavailable'); }
    res.writeHead(200, { 'Content-Type': `${entry[1]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(bytes);
  });
});
server.on('error', error => { console.error(`プレビューを起動できませんでした：${error.message}`); process.exitCode = 1; });
server.listen(4173, '127.0.0.1', () => console.log('チームクエスト：http://127.0.0.1:4173\n終了するには Ctrl+C を押してください。'));
