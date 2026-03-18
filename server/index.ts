// ── TC Command Telephony Server ─────────────────────────────────────────────
// Express server for voice, SMS receive, and callback routes.
// Deployed on Railway — persistent process with no timeout limits.
// Frontend + dashboard APIs remain on Vercel.

import express from 'express';
import cors from 'cors';
import { voiceRouter } from './routes/voice';
import { smsReceiveRouter } from './routes/sms-receive';
import { callbacksRouter } from './routes/callbacks';

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ─────────────────────────────────────────────────────────────────

// Twilio sends form-encoded POST bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// CORS — only needed for callbacks (called from frontend)
// Voice and SMS are Twilio→server only (no browser origin)
app.use(cors({
  origin: [
    'https://tcappmyredeal.vercel.app',
    /\.vercel\.app$/,
    'http://localhost:5173',
  ],
  methods: ['GET', 'POST'],
  credentials: true,
}));

// ── Health Check ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'tc-command-telephony',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/voice', voiceRouter);
app.use('/sms', smsReceiveRouter);
app.use('/callbacks', callbacksRouter);

// ── 404 Handler ───────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', service: 'tc-command-telephony' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 TC Command Telephony server running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Voice:  POST /voice/:route`);
  console.log(`   SMS:    POST /sms/receive`);
  console.log(`   Calls:  GET/POST /callbacks/:action`);
});
