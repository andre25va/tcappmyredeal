const express = require('express');
const puppeteer = require('puppeteer-core');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));

const MLS_USERNAME = process.env.MLS_USERNAME || '360602553';
const MLS_PASSWORD = process.env.MLS_PASSWORD || 'Chicago60459.312';
const GMAIL_USER = process.env.GMAIL_USER || 'tc@myredeal.com';
const GMAIL_PASS = process.env.GMAIL_PASS || 'tplougdlujjvsvls';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASS,
  },
});

async function scrapeMatrixDocs(mlsNumber) {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,900',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const logs = [];
  const log = (msg) => { console.log(msg); logs.push(msg); };

  try {
    // ── Step 1: Login ──────────────────────────────────────────────
    log('Navigating to Matrix login...');
    await page.goto('https://matrix.heartlandmls.com', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Accept any "accept cookies" or terms dialog if present
    try {
      const acceptBtn = await page.$('[id*="accept"], [class*="accept"], button[data-testid="accept"]');
      if (acceptBtn) await acceptBtn.click();
    } catch (_) {}

    log('Filling login credentials...');
    // Matrix login form — try multiple selector patterns
    const usernameSelectors = ['#username', '#UserName', 'input[name="username"]', 'input[name="UserName"]', 'input[type="text"]'];
    const passwordSelectors = ['#password', '#Password', 'input[name="password"]', 'input[name="Password"]', 'input[type="password"]'];

    let usernameField = null;
    for (const sel of usernameSelectors) {
      usernameField = await page.$(sel);
      if (usernameField) { log(`Found username field: ${sel}`); break; }
    }
    if (!usernameField) throw new Error('Could not find username field on Matrix login page');

    let passwordField = null;
    for (const sel of passwordSelectors) {
      passwordField = await page.$(sel);
      if (passwordField) { log(`Found password field: ${sel}`); break; }
    }
    if (!passwordField) throw new Error('Could not find password field on Matrix login page');

    await usernameField.click({ clickCount: 3 });
    await usernameField.type(MLS_USERNAME);
    await passwordField.click({ clickCount: 3 });
    await passwordField.type(MLS_PASSWORD);

    log('Submitting login...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.keyboard.press('Enter'),
    ]);

    const currentUrl = page.url();
    log(`Post-login URL: ${currentUrl}`);
    if (currentUrl.includes('login') || currentUrl.includes('Login')) {
      throw new Error('Login failed — still on login page');
    }

    // ── Step 2: Search MLS number ──────────────────────────────────
    log(`Searching for MLS# ${mlsNumber}...`);

    // Try Quick Search bar first
    const searchSelectors = [
      '#searchInput',
      '#QuickSearchBox',
      'input[placeholder*="MLS"]',
      'input[placeholder*="Search"]',
      'input[name*="search"]',
      '#m_upQS_m_tbSearchText',
    ];

    let searchField = null;
    for (const sel of searchSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 });
        searchField = await page.$(sel);
        if (searchField) { log(`Found search field: ${sel}`); break; }
      } catch (_) {}
    }

    if (!searchField) {
      // Try navigating to search URL directly
      log('No search field found, trying direct URL search...');
      await page.goto(`https://matrix.heartlandmls.com/matrix/search/residential/detail?MLNumber=${mlsNumber}`, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
    } else {
      await searchField.click({ clickCount: 3 });
      await searchField.type(mlsNumber);
      await page.keyboard.press('Enter');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    }

    log(`Search URL: ${page.url()}`);

    // ── Step 3: Find listing and click Documents ───────────────────
    log('Looking for listing link...');

    // If we're on a results list, click the first result
    const listingLinkSelectors = [
      `a[href*="${mlsNumber}"]`,
      '.listingResult a',
      'td.address a',
      '.gridResult a',
    ];

    for (const sel of listingLinkSelectors) {
      const link = await page.$(sel);
      if (link) {
        log(`Clicking listing link: ${sel}`);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }),
          link.click(),
        ]);
        break;
      }
    }

    log(`Listing URL: ${page.url()}`);

    // ── Step 4: Find Documents/Supplements tab ─────────────────────
    log('Looking for Documents/Supplements tab...');
    const docTabSelectors = [
      'a[href*="document" i]',
      'a[href*="supplement" i]',
      'span:has-text("Documents")',
      'a:has-text("Documents")',
      'a:has-text("Supplements")',
      'a:has-text("View Documents")',
      '[id*="document" i]',
      '[id*="supplement" i]',
    ];

    let docTabClicked = false;
    for (const sel of docTabSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          log(`Clicking doc tab: ${sel}`);
          await el.click();
          await page.waitForTimeout(2000);
          docTabClicked = true;
          break;
        }
      } catch (_) {}
    }

    if (!docTabClicked) {
      // Try finding by text content
      const clicked = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a, button, span'));
        for (const el of links) {
          const text = el.textContent?.trim().toLowerCase() || '';
          if (text.includes('document') || text.includes('supplement')) {
            el.click();
            return el.textContent?.trim();
          }
        }
        return null;
      });
      if (clicked) {
        log(`Clicked element with text: ${clicked}`);
        await page.waitForTimeout(2000);
        docTabClicked = true;
      }
    }

    if (!docTabClicked) {
      log('WARNING: Could not find Documents tab — may already be on page');
    }

    // ── Step 5: Collect document links ────────────────────────────
    log('Collecting document links...');
    await page.waitForTimeout(2000);

    const docLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      return links
        .filter(a => {
          const href = a.href.toLowerCase();
          const text = a.textContent?.toLowerCase() || '';
          return (
            href.includes('.pdf') ||
            href.includes('document') ||
            href.includes('supplement') ||
            href.includes('getdoc') ||
            href.includes('download') ||
            text.includes('.pdf')
          );
        })
        .map(a => ({ href: a.href, text: a.textContent?.trim() }));
    });

    log(`Found ${docLinks.length} document link(s): ${JSON.stringify(docLinks)}`);

    if (docLinks.length === 0) {
      return { success: false, message: 'No documents found for this MLS listing', logs };
    }

    // ── Step 6: Download each PDF ─────────────────────────────────
    const pdfs = [];
    const client = await page.target().createCDPSession();
    await client.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: '/tmp',
    });

    for (const { href, text } of docLinks.slice(0, 10)) {
      try {
        log(`Fetching doc: ${href}`);
        const response = await page.goto(href, { waitUntil: 'networkidle2', timeout: 20000 });
        if (response) {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('pdf') || href.toLowerCase().includes('.pdf')) {
            const buffer = await response.buffer();
            pdfs.push({
              filename: text || `supplement-${pdfs.length + 1}.pdf`,
              content: buffer.toString('base64'),
              contentType: 'application/pdf',
            });
            log(`Downloaded PDF: ${text} (${buffer.length} bytes)`);
          }
        }
      } catch (err) {
        log(`Error downloading ${href}: ${err.message}`);
      }
    }

    if (pdfs.length === 0) {
      return { success: false, message: 'Found document links but could not download PDFs', logs };
    }

    return { success: true, pdfs, logs };
  } finally {
    await browser.close();
  }
}

// ── Routes ─────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'mls-scraper' }));

app.post('/scrape-and-email', async (req, res) => {
  const { mlsNumber, toEmail } = req.body;

  if (!mlsNumber) {
    return res.status(400).json({ error: 'mlsNumber is required' });
  }

  const recipient = toEmail || GMAIL_USER;
  console.log(`Starting scrape for MLS# ${mlsNumber} → email to ${recipient}`);

  try {
    const result = await scrapeMatrixDocs(mlsNumber);

    if (!result.success) {
      // Send TC a "no docs" email
      await transporter.sendMail({
        from: `"MyReDeal TC" <${GMAIL_USER}>`,
        to: GMAIL_USER,
        subject: `⚠️ No documents found — MLS# ${mlsNumber}`,
        html: `<p>No supplement documents were found in Heartland Matrix for MLS# <strong>${mlsNumber}</strong>.</p><p>Please check the listing manually.</p><pre style="font-size:11px;color:#666">${result.logs?.join('\n')}</pre>`,
      });

      return res.json({ success: false, message: result.message, logs: result.logs });
    }

    // Build attachments
    const attachments = result.pdfs.map((pdf, i) => ({
      filename: pdf.filename.includes('.pdf') ? pdf.filename : `${pdf.filename}.pdf`,
      content: Buffer.from(pdf.content, 'base64'),
      contentType: 'application/pdf',
    }));

    // Send email to TC (Module 1 — later this becomes agent's folder email)
    await transporter.sendMail({
      from: `"MyReDeal TC" <${GMAIL_USER}>`,
      to: recipient,
      subject: `📎 MLS# ${mlsNumber} — Supplement Documents (${attachments.length} file${attachments.length !== 1 ? 's' : ''})`,
      html: `
        <div style="font-family:sans-serif;color:#1a1a1a;background:#fff;padding:20px">
          <h2 style="color:#1a1a1a">MLS Supplement Documents</h2>
          <p>Attached are <strong>${attachments.length}</strong> supplement document(s) fetched from Heartland Matrix for MLS# <strong>${mlsNumber}</strong>.</p>
          <p style="color:#666;font-size:13px">Fetched automatically by MyReDeal TC</p>
        </div>
      `,
      attachments,
    });

    console.log(`✅ Emailed ${attachments.length} PDF(s) to ${recipient}`);
    return res.json({ success: true, pdfCount: attachments.length, recipient, logs: result.logs });
  } catch (err) {
    console.error('Scrape error:', err);

    // Email TC about the failure
    await transporter.sendMail({
      from: `"MyReDeal TC" <${GMAIL_USER}>`,
      to: GMAIL_USER,
      subject: `❌ MLS scraper error — MLS# ${mlsNumber}`,
      html: `<p>The Matrix scraper hit an error for MLS# <strong>${mlsNumber}</strong>.</p><p><strong>Error:</strong> ${err.message}</p>`,
    }).catch(() => {});

    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MLS scraper running on port ${PORT}`));
