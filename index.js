import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __path = path.dirname(__filename);
const PORT = process.env.PORT || 8000;

import { router as code } from './pair.js';

EventEmitter.defaultMaxListeners = 500;

// Middleware FIRST (මේ order එක වැදගත්)
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' });
  next();
});
// slip upload (base64) walata limit eka wadi kala
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Routes
app.use('/code', code);

app.get('/pair', (req, res) => {
  res.sendFile(path.join(__path, 'main.html'));
});

// 💎 Pro bot pair page (slip + number upload)
app.get(['/pro', '/pro-pair'], (req, res) => {
  res.sendFile(path.join(__path, 'pro.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__path, 'main.html'));
});

app.listen(PORT, () => {
  console.log(`
 ██████╗  ██╗  ██╗ ██████╗ ███████╗████████╗
██╔════╝  ██║  ██║██╔═══██╗██╔════╝╚══██╔══╝
██║  ███╗ ███████║██║   ██║███████╗   ██║   
██║   ██║ ██╔══██║██║   ██║╚════██║   ██║   
╚██████╔╝ ██║  ██║╚██████╔╝███████║   ██║   
 ╚═════╝  ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝   

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💖 Don't Forget To Give a Star
🌐 URL    : http://localhost:${PORT}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
});

export default app;
