const express = require('express');
const puppeteer = require('puppeteer-core');

const app = express();
app.use(express.json({ limit: '50mb' }));

const MLS_USERNAME = process.env.MLS_USERNAME || '360602553';
const MLS_PASSWORD = process.env.MLS_PASSWORD || 'Chicago60459.312';

async function scrapeMatrixDocs(mlsNumber) {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: 'new',
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--ignore-certificate-errors',
      '--ignore-ssl-errors',
      '--window-size=1280,900',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Intercept PDF downloads via response
  const logs = [];
  const log = (msg) => { console.log(msg); logs.push(msg); };

  try {
    // ── Step 1: Login ──────────────────────────────────────────────
    log('Navigating to Matrix login...');
    await page.goto('https://matrix.heartlandmls.com', {
      waitUntil: 'networkidle2',
      timeout: 45000,
    });

    log(`Pre-login URL: ${page.url()}`);

    // Try to fill the login form (might be on Clareity SSO or Matrix)
    const usernameSelectors = ['#username', '#UserName', 'input[name="username"]', 'input[name="UserName"]', 'input[type="text"]:not([type="hidden"])'];
    const passwordSelectors = ['#password', '#Password', 'input[name="password"]', 'input[name="Password"]', 'input[type="password"]'];

    let usernameField = null;
    for (const sel of usernameSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        usernameField = await page.$(sel);
        if (usernameField) { log(`Found username: ${sel}`); break; }
      } catch (_) {}
    }

    if (!usernameField) throw new Error('Could not find username field on login page');

    let passwordField = null;
    for (const sel of passwordSelectors) {
      passwordField = await page.$(sel);
      if (passwordField) { log(`Found password: ${sel}`); break; }
    }
    if (!passwordField) throw new Error('Could not find password field on login page');

    await usernameField.click({ clickCount: 3 });
    await usernameField.type(MLS_USERNAME, { delay: 50 });
    await passwordField.click({ clickCount: 3 });
    await passwordField.type(MLS_PASSWORD, { delay: 50 });

    log('Submitting login...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.keyboard.press('Enter'),
    ]);

    log(`Post-login URL: ${page.url()}`);

    // ── Step 2: Navigate into Matrix from Clareity SSO ─────────────
    // If we landed on Clareity portal (not Matrix), go back to Matrix
    if (!page.url().includes('matrix.heartlandmls.com')) {
      log('On Clareity SSO portal — navigating to Matrix search...');
      await page.goto('https://matrix.heartlandmls.com/matrix/search/residential', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      log(`Matrix URL: ${page.url()}`);
    }

    // Check if we got redirected to login again (session not carried)
    if (page.url().includes('login') || page.url().includes('Login')) {
      throw new Error('Session not carried to Matrix — MLS credentials may need renewal');
    }

    // ── Step 3: Search for MLS number ─────────────────────────────
    log(`Searching MLS# ${mlsNumber}...`);

    // Try the Matrix quick search box
    const searchSelectors = [
      '#m_upQS_m_tbSearchText',
      '#QuickSearchBox',
      'input[placeholder*="MLS"]',
      'input[placeholder*="Search"]',
      'input[id*="Search"]',
      'input[id*="search"]',
    ];

    let searchField = null;
    for (const sel of searchSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 4000 });
        searchField = await page.$(sel);
        if (searchField) { log(`Found search: ${sel}`); break; }
      } catch (_) {}
    }

    if (searchField) {
      await searchField.click({ clickCount: 3 });
      await searchField.type(mlsNumber, { delay: 50 });
      await page.keyboard.press('Enter');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
      log(`After search URL: ${page.url()}`);
    } else {
      // Try direct search URL
      log('No search field — trying direct URL...');
      await page.goto(
        `https://matrix.heartlandmls.com/matrix/search/residential?${mlsNumber}`,
        { waitUntil: 'networkidle2', timeout: 20000 }
      );
      log(`Direct search URL: ${page.url()}`);
    }

    // ── Step 4: Find listing link and click it ─────────────────────
    log('Looking for listing link...');

    // If on a results page, click first result
    const listingSelectors = [
      `a[href*="${mlsNumber}"]`,
      '.gridMain a',
      '.results a',
      'td.col-MLS_Listing_MLS_Number a',
      '#listingDetailsTabs_header',
    ];

    for (const sel of listingSelectors) {
      const link = await page.$(sel);
      if (link) {
        log(`Clicking listing: ${sel}`);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
          link.click(),
        ]);
        break;
      }
    }

    log(`Listing page URL: ${page.url()}`);

    // ── Step 5: Find and click Documents tab ──────────────────────
    log('Looking for Documents tab...');
    await page.waitForTimeout(1500);

    const clicked = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('a, button, li, span, div'));
      for (const el of all) {
        const txt = (el.textContent || '').trim().toLowerCase();
        if (txt === 'documents' || txt === 'supplements' || txt === 'view documents' || txt.includes('supplement')) {
          el.click();
          return `Clicked: "${el.textContent?.trim()}" (${el.tagName})`;
        }
      }
      return null;
    });

    if (clicked) {
      log(clicked);
      await page.waitForTimeout(2500);
    } else {
      log('No Documents tab found — scanning current page for doc links');
    }

    // ── Step 6: Collect document links ────────────────────────────
    log('Collecting document links...');
    await page.waitForTimeout(1000);

    const docLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      return links
        .filter(a => {
          const href = (a.href || '').toLowerCase();
          const text = (a.textContent || '').toLowerCase();
          return (
            href.includes('.pdf') ||
            href.includes('getdoc') ||
            href.includes('document') ||
            href.includes('supplement') ||
            href.includes('download') ||
            text.includes('.pdf') ||
            text.includes('supplement')
          );
        })
        .slice(0, 10)
        .map(a => ({ href: a.href, text: (a.textContent || '').trim() }));
    });

    log(`Found ${docLinks.length} doc link(s): ${JSON.stringify(docLinks)}`);

    if (docLinks.length === 0) {
      // Screenshot for debugging
      const shot = await page.screenshot({ encoding: 'base64', fullPage: false });
      return {
        success: false,
        message: 'No documents found for this MLS listing',
        logs,
        debugScreenshot: shot,
      };
    }

    // ── Step 7: Download each PDF ──────────────────────────────────
    const pdfs = [];

    for (const { href, text } of docLinks) {
      try {
        log(`Fetching: ${href}`);
        const response = await page.goto(href, { waitUntil: 'networkidle2', timeout: 20000 });
        if (response) {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('pdf') || href.toLowerCase().includes('.pdf')) {
            const buffer = await response.buffer();
            const safeName = (text || `supplement-${pdfs.length + 1}`)
              .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
              .trim();
            pdfs.push({
              filename: safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`,
              content: buffer.toString('base64'),
              size: buffer.length,
            });
            log(`Downloaded: ${safeName} (${buffer.length} bytes)`);
          }
        }
      } catch (err) {
        log(`Error downloading ${href}: ${err.message}`);
      }
    }

    if (pdfs.length === 0) {
      return { success: false, message: 'Found doc links but could not download PDFs', logs };
    }

    return { success: true, pdfs, pdfCount: pdfs.length, logs };

  } finally {
    await browser.close();
  }
}

// ── Routes ─────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'mls-scraper' }));

// Module 1: scrape and return PDFs (n8n handles email)
app.post('/scrape', async (req, res) => {
  const { mlsNumber } = req.body;
  if (!mlsNumber) return res.status(400).json({ error: 'mlsNumber is required' });

  console.log(`Scraping MLS# ${mlsNumber}`);
  try {
    const result = await scrapeMatrixDocs(mlsNumber);
    return res.json(result);
  } catch (err) {
    console.error('Scrape error:', err);
    return res.status(500).json({ error: err.message, logs: [] });
  }
});

// Convenience alias used by n8n workflow
app.post('/scrape-and-email', async (req, res) => {
  // Now just runs the scrape — n8n handles the email
  const { mlsNumber } = req.body;
  if (!mlsNumber) return res.status(400).json({ error: 'mlsNumber is required' });

  console.log(`Scraping MLS# ${mlsNumber}`);
  try {
    const result = await scrapeMatrixDocs(mlsNumber);
    return res.json(result);
  } catch (err) {
    console.error('Scrape error:', err);
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MLS scraper running on port ${PORT}`));
