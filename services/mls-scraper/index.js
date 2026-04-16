const express = require('express');
const puppeteer = require('puppeteer-core');
const nodemailer = require('nodemailer');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MATRIX_BASE = 'https://hmls.mlsmatrix.com';

// ── Parse cookie string into array of cookie objects ─────────────────────────
function parseCookieString(cookieStr) {
  return cookieStr.split(';').map(part => {
    const [name, ...rest] = part.trim().split('=');
    return {
      name: name.trim(),
      value: rest.join('=').trim(),
      domain: 'hmls.mlsmatrix.com',
      path: '/',
    };
  }).filter(c => c.name && c.value);
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mls-scraper' });
});

// ── Scrape ────────────────────────────────────────────────────────────────────
app.post('/scrape', async (req, res) => {
  const { mlsNumber } = req.body || {};
  if (!mlsNumber) return res.status(400).json({ error: 'mlsNumber required' });

  const cookieStr = process.env.MATRIX_COOKIES;
  if (!cookieStr) return res.status(500).json({ error: 'MATRIX_COOKIES env var not set' });

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

    // ── Step 1: Set cookies on about:blank BEFORE navigating to Matrix ───────
    log('Setting Matrix session cookies before any navigation...');
    const cookies = parseCookieString(cookieStr);
    log(`Parsed ${cookies.length} cookies`);

    // Start on blank page so setCookie works cleanly with explicit domain
    await page.goto('about:blank');
    await page.setCookie(...cookies);
    log('Cookies set on hmls.mlsmatrix.com domain — navigating to Matrix...');

    // ── Step 2: Navigate to Matrix home with cookies pre-loaded ───────────────
    await page.goto(MATRIX_BASE + '/Matrix/Home', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    const url = page.url();
    log(`After cookie reload — URL: ${url}`);

    // Check we're actually inside Matrix (not redirected to login)
    if (url.includes('clareity') || url.includes('/idp/login')) {
      const screenshot = await page.screenshot({ encoding: 'base64' });
      await browser.close();
      return res.status(401).json({
        success: false,
        message: 'Cookies expired — need to refresh MATRIX_COOKIES env var',
        debugScreenshot: screenshot,
        logs,
      });
    }

    // ── Step 3: Search for MLS number ─────────────────────────────────────────
    log(`Searching for MLS# ${mlsNumber}...`);
    const searchUrl = `${MATRIX_BASE}/Matrix/Search/ResidentialSale?ReturnUrl=%2fMatrix%2fSearch%2fResidentialSale`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Try quick search box (top of page)
    try {
      await page.waitForSelector('input[id*="Txt_Keyword"], input[name*="keyword"], #Txt_Keyword_0', { timeout: 8000 });
      const searchBox = await page.$('input[id*="Txt_Keyword"], input[name*="keyword"], #Txt_Keyword_0');
      if (searchBox) {
        await searchBox.click({ clickCount: 3 });
        await searchBox.type(mlsNumber);
        await page.keyboard.press('Return');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
        log(`Quick search done — URL: ${page.url()}`);
      }
    } catch (e) {
      log('Quick search box not found, trying top bar search...');
      // Fall back to top bar MLS# search
      try {
        await page.waitForSelector('input[placeholder*="MLS"], input[placeholder*="Shorthand"]', { timeout: 5000 });
        const topSearch = await page.$('input[placeholder*="MLS"], input[placeholder*="Shorthand"]');
        if (topSearch) {
          await topSearch.click({ clickCount: 3 });
          await topSearch.type(mlsNumber);
          await page.keyboard.press('Return');
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
          log(`Top search done — URL: ${page.url()}`);
        }
      } catch (e2) {
        log('Trying direct URL search...');
        // Direct listing search URL
        await page.goto(
          `${MATRIX_BASE}/Matrix/Search/ResidentialSale?ReturnUrl=%2fMatrix%2fSearch%2fResidentialSale&search_type=detailsearch&mls_number=${mlsNumber}`,
          { waitUntil: 'networkidle2', timeout: 30000 }
        );
      }
    }

    log(`Search result URL: ${page.url()}`);

    // ── Step 4: Find listing link and click into it ───────────────────────────
    log('Looking for listing result...');
    let listingFound = false;

    // Try to click on the first result row
    try {
      await page.waitForSelector('a[id*="lnkSummary"], .MatrixResultsRow a, table.SearchResultsTable a', { timeout: 10000 });
      const link = await page.$('a[id*="lnkSummary"], .MatrixResultsRow a, table.SearchResultsTable a');
      if (link) {
        await link.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
        log(`Listing page URL: ${page.url()}`);
        listingFound = true;
      }
    } catch (e) {
      log('No listing link found via standard selector');
    }

    // Alternative: try the MLS# as a shorthand search in the top bar
    if (!listingFound) {
      log('Trying top shorthand search bar...');
      try {
        await page.goto(MATRIX_BASE + '/Matrix/Home', { waitUntil: 'networkidle2', timeout: 20000 });
        const topInput = await page.$('input[placeholder*="MLS"], input[placeholder*="Shorthand"], input.searchBar');
        if (topInput) {
          await topInput.click({ clickCount: 3 });
          await topInput.type(mlsNumber);
          await page.keyboard.press('Return');
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
          log(`After shorthand search: ${page.url()}`);
          // Click first result
          const link = await page.$('a[id*="lnkSummary"], .MatrixResultsRow a, .resultsRow a').catch(() => null);
          if (link) {
            await link.click();
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
            log(`Listing page: ${page.url()}`);
            listingFound = true;
          }
        }
      } catch (e) {
        log('Shorthand search also failed');
      }
    }

    if (!listingFound) {
      const screenshot = await page.screenshot({ encoding: 'base64' });
      await browser.close();
      return res.json({
        success: false,
        message: 'Could not find listing for MLS# ' + mlsNumber,
        debugScreenshot: screenshot,
        logs,
      });
    }

    // ── Step 5: Click "View Documents" / Supplements ──────────────────────────
    log('Looking for Documents tab...');
    let docsFound = false;
    try {
      // Look for a "Documents" or "Supplements" link on the listing detail page
      await page.waitForSelector('a[href*="Document"], a[href*="Supplement"], a:contains("Document")', { timeout: 10000 }).catch(() => {});

      const docsLink = await page.evaluateHandle(() => {
        const links = Array.from(document.querySelectorAll('a'));
        return links.find(l =>
          l.textContent.trim().toLowerCase().includes('document') ||
          l.textContent.trim().toLowerCase().includes('supplement')
        );
      });

      if (docsLink && docsLink.asElement()) {
        await docsLink.asElement().click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
        log(`Documents page URL: ${page.url()}`);
        docsFound = true;
      }
    } catch (e) {
      log('Documents tab not found via link: ' + e.message);
    }

    if (!docsFound) {
      const screenshot = await page.screenshot({ encoding: 'base64' });
      await browser.close();
      return res.json({
        success: false,
        message: 'Could not find Documents tab for this listing',
        debugScreenshot: screenshot,
        logs,
      });
    }

    // ── Step 6: Download PDFs ─────────────────────────────────────────────────
    log('Finding PDF links...');
    const pdfLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*=".pdf"], a[href*="Download"], a[href*="document"]'))
        .map(a => ({ href: a.href, text: a.textContent.trim() }))
        .filter(l => l.href);
    });

    log(`Found ${pdfLinks.length} PDF links`);

    const pdfs = [];
    for (const link of pdfLinks.slice(0, 10)) { // cap at 10
      try {
        const response = await page.evaluate(async (url) => {
          const res = await fetch(url, { credentials: 'include' });
          if (!res.ok) return null;
          const buffer = await res.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          return {
            data: btoa(binary),
            type: res.headers.get('content-type') || 'application/pdf',
          };
        }, link.href);

        if (response && response.data) {
          const filename = link.text.replace(/[^a-z0-9]/gi, '_').slice(0, 50) + '.pdf';
          pdfs.push({
            filename,
            data: response.data,
            size: Math.round(response.data.length * 0.75),
          });
          log(`Downloaded: ${filename}`);
        }
      } catch (e) {
        log(`Failed to download ${link.href}: ${e.message}`);
      }
    }

    await browser.close();

    if (pdfs.length === 0) {
      return res.json({
        success: false,
        message: 'No PDFs found for MLS# ' + mlsNumber,
        logs,
      });
    }

    return res.json({
      success: true,
      pdfCount: pdfs.length,
      mlsNumber,
      pdfs: pdfs.map(p => ({ filename: p.filename, size: p.size, data: p.data })),
      logs,
    });

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('Scrape error:', err);
    return res.status(500).json({ success: false, error: err.message, logs });
  }
});

app.listen(PORT, () => {
  console.log(`MLS scraper listening on port ${PORT}`);
});
