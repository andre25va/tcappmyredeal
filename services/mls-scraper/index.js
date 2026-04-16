const express = require('express');
const puppeteer = require('puppeteer-core');

const app = express();
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3000;
const MATRIX_BASE = 'https://hmls.mlsmatrix.com';
const SUPABASE_EMAIL_FN = 'https://alxrmusieuzgssynktxg.supabase.co/functions/v1/mls-email-supplements';

// ── Parse "name=value; name=value; ..." into Puppeteer cookie objects ─────────
function parseCookieString(cookieStr) {
  return cookieStr.split(';').map(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return null;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name || !value) return null;
    return { name, value, domain: 'hmls.mlsmatrix.com', path: '/' };
  }).filter(Boolean);
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'mls-scraper' }));

// ── Core scrape logic ─────────────────────────────────────────────────────────
async function scrapeMLS(mlsNumber) {
  const cookieStr = process.env.MATRIX_COOKIES;
  if (!cookieStr) throw new Error('MATRIX_COOKIES env var not set');

  const logs = [];
  const log = (msg) => { console.log(msg); logs.push(msg); };

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--ignore-certificate-errors',
      ],
      headless: true,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // ── Step 1: Inject session cookies ────────────────────────────────────────
    log('Injecting Matrix session cookies...');
    const cookies = parseCookieString(cookieStr);
    log(`Parsed ${cookies.length} cookies`);
    await page.goto('about:blank');
    await page.setCookie(...cookies);

    // ── Step 2: Navigate to Matrix Home ───────────────────────────────────────
    log('Navigating to Matrix Home...');
    await page.goto(MATRIX_BASE + '/Matrix/Home', {
      waitUntil: 'networkidle2',
      timeout: 45000,
    });

    const homeUrl = page.url();
    log(`Home URL: ${homeUrl}`);

    if (homeUrl.includes('clareity') || homeUrl.includes('/idp/login') || homeUrl.includes('login')) {
      await browser.close();
      return {
        success: false,
        cookiesExpired: true,
        message: 'Cookies expired — need to refresh MATRIX_COOKIES',
        logs,
      };
    }

    // ── Step 3: Search for MLS# ───────────────────────────────────────────────
    log(`Searching for MLS# ${mlsNumber}...`);
    await page.waitForSelector(
      'input[placeholder*="Shorthand"], input[placeholder*="MLS#"], input[placeholder*="MLS"]',
      { timeout: 20000 }
    );
    const searchInput = await page.$(
      'input[placeholder*="Shorthand"], input[placeholder*="MLS#"], input[placeholder*="MLS"]'
    );
    if (!searchInput) throw new Error('Search input not found on Matrix home');

    await searchInput.click({ clickCount: 3 });
    await searchInput.type(String(mlsNumber));
    await page.keyboard.press('Enter');

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    log(`Results URL: ${page.url()}`);

    // ── Step 4: Find "View Documents" link ────────────────────────────────────
    log('Waiting for "View Documents" link...');
    let viewDocsLink = null;

    try {
      await page.waitForSelector('a[data-original-title="To Documents"]', { timeout: 20000 });
      viewDocsLink = await page.$('a[data-original-title="To Documents"]');
    } catch (e) {
      viewDocsLink = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('a'))
          .find(a => a.textContent.trim() === 'View Documents') || null;
      });
      if (viewDocsLink && !(await viewDocsLink.asElement())) viewDocsLink = null;
    }

    if (!viewDocsLink) {
      await browser.close();
      return {
        success: false,
        message: `No "View Documents" link found for MLS# ${mlsNumber} — listing may have no supplements`,
        logs,
      };
    }

    log('Found "View Documents" link — opening documents popup...');

    // ── Step 5: Click and capture popup ──────────────────────────────────────
    const popupPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Popup did not open within 20s')), 20000);
      browser.once('targetcreated', async (target) => {
        clearTimeout(timeout);
        const popupPage = await target.page();
        resolve(popupPage);
      });
    });

    const el = viewDocsLink.asElement ? viewDocsLink.asElement() : viewDocsLink;
    await el.click();

    const popup = await popupPromise;
    log(`Popup opened: ${popup.url()}`);

    // ── Step 6: Extract PDF links ──────────────────────────────────────────────
    log('Waiting for PDF links in popup...');
    await popup.waitForSelector('a[href*="GetMedia.ashx"]', { timeout: 20000 });

    const pdfLinks = await popup.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="GetMedia.ashx"]')).map(a => ({
        href: a.href,
        name: (a.textContent.trim() || a.getAttribute('title') || 'document.pdf'),
      }));
    });

    log(`Found ${pdfLinks.length} PDF link(s): ${pdfLinks.map(l => l.name).join(', ')}`);

    if (pdfLinks.length === 0) {
      await browser.close();
      return { success: true, files: [], message: 'No PDF documents found in listing', logs };
    }

    // ── Step 7: Download PDFs via in-page fetch ────────────────────────────────
    log('Downloading PDFs...');
    const files = [];

    for (const link of pdfLinks.slice(0, 15)) {
      try {
        log(`Downloading: ${link.name}`);
        const base64 = await popup.evaluate(async (url) => {
          const res = await fetch(url, { credentials: 'include' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = await res.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          return btoa(binary);
        }, link.href);

        const ext = link.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
        files.push({ name: link.name, data: base64, mimeType: ext });
        log(`✓ Downloaded ${link.name} (${Math.round(base64.length * 0.75 / 1024)}KB)`);
      } catch (e) {
        log(`✗ Failed ${link.name}: ${e.message}`);
      }
    }

    await browser.close();
    return { success: true, mlsNumber, pdfCount: files.length, files, logs };

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    throw err;
  }
}

// ── POST /scrape — returns base64 PDFs (for direct use) ──────────────────────
app.post('/scrape', async (req, res) => {
  const { mlsNumber } = req.body || {};
  if (!mlsNumber) return res.status(400).json({ error: 'mlsNumber required' });

  try {
    const result = await scrapeMLS(mlsNumber);
    return res.json(result);
  } catch (err) {
    console.error('Scrape error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /scrape-and-send — scrapes PDFs + calls Supabase to email ───────────
// n8n calls this with { mlsNumber, emailTo? } — no large data passes through n8n
app.post('/scrape-and-send', async (req, res) => {
  const { mlsNumber, emailTo } = req.body || {};
  if (!mlsNumber) return res.status(400).json({ error: 'mlsNumber required' });

  const recipient = emailTo || 'tc@myredeal.com';

  let scrapeResult;
  try {
    scrapeResult = await scrapeMLS(mlsNumber);
  } catch (err) {
    console.error('Scrape error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }

  if (!scrapeResult.success) {
    return res.json(scrapeResult);
  }

  if (!scrapeResult.files || scrapeResult.files.length === 0) {
    return res.json({ ...scrapeResult, files: undefined, emailSent: false, emailNote: 'No PDFs found' });
  }

  // ── Call Supabase edge fn to send email (no SMTP needed) ────────────────────
  try {
    log_console(`Calling Supabase to email ${scrapeResult.pdfCount} PDF(s) to ${recipient}...`);
    const supaRes = await fetch(SUPABASE_EMAIL_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mlsNumber,
        emailTo: recipient,
        files: scrapeResult.files,
      }),
    });

    const supaData = await supaRes.json();

    if (!supaRes.ok || !supaData.success) {
      return res.json({
        success: false,
        emailSent: false,
        emailError: supaData.error || 'Supabase email fn error',
        logs: scrapeResult.logs,
      });
    }

    return res.json({
      success: true,
      mlsNumber,
      pdfCount: scrapeResult.pdfCount,
      emailSent: true,
      emailTo: recipient,
      messageId: supaData.messageId,
      logs: scrapeResult.logs,
    });
  } catch (emailErr) {
    console.error('Email dispatch error:', emailErr);
    return res.json({
      success: false,
      emailSent: false,
      emailError: emailErr.message,
      logs: scrapeResult.logs,
    });
  }
});

function log_console(msg) { console.log(msg); }

app.listen(PORT, () => {
  console.log(`MLS scraper listening on port ${PORT}`);
});
