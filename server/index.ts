// ── TC Command Telephony Server ─────────────────────────────────────────────
// Express server for voice, SMS receive, and callback routes.
// Deployed on Railway — persistent process with no timeout limits.
// Frontend + dashboard APIs remain on Vercel.

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

console.log('🚂 Starting TC Command Telephony server...');
console.log(`   PORT=${PORT}`);
console.log(`   NODE_ENV=${process.env.NODE_ENV}`);
console.log(`   SUPABASE_URL=${process.env.SUPABASE_URL ? 'set' : 'MISSING'}`);
console.log(`   TWILIO_ACCOUNT_SID=${process.env.TWILIO_ACCOUNT_SID ? 'set' : 'MISSING'}`);
console.log(`   OPENAI_API_KEY=${process.env.OPENAI_API_KEY ? 'set' : 'MISSING'}`);

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
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

// ── Routes (loaded with error handling) then start server ───────────────────
async function loadRoutes() {
  try {
    console.log('Loading voice routes...');
    const { voiceRouter } = await import('./routes/voice.js');
    app.use('/voice', voiceRouter);
    console.log('✅ Voice routes loaded');
  } catch (e) {
    console.error('❌ Failed to load voice routes:', e);
  }

  try {
    console.log('Loading SMS routes...');
    const { smsReceiveRouter } = await import('./routes/sms-receive.js');
    app.use('/sms', smsReceiveRouter);
    console.log('✅ SMS routes loaded');
  } catch (e) {
    console.error('❌ Failed to load SMS routes:', e);
  }

  try {
    console.log('Loading callback routes...');
    const { callbacksRouter } = await import('./routes/callbacks.js');
    app.use('/callbacks', callbacksRouter);
    console.log('✅ Callback routes loaded');
  } catch (e) {
    console.error('❌ Failed to load callback routes:', e);
  }

  // ── 404 Handler (MUST be after all routes) ──────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found', service: 'tc-command-telephony' });
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
loadRoutes().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 TC Command Telephony server running on port ${PORT}`);
  });
}).catch((e) => {
  console.error('Fatal startup error:', e);
  app.listen(PORT, () => {
    console.log(`⚠️ Server started with errors on port ${PORT}`);
  });
});
