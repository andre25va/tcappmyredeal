const express = require('express');
const { chromium } = require('playwright');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Cookie helpers
// Cookies are stored as a JSON array in the MLS_MATRIX_COOKIES env var.
// Format:
// [{ name, value, domain, path, httpOnly, secure }, ...]
// ---------------------------------------------------------------------------
function getCookies() {
  try {
    const raw = process.env.MLS_MATRIX_COOKIES;
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mls-listing-fetcher' });
});

// ---------------------------------------------------------------------------
// /listing/:mlsNumber
// Returns full listing data scraped directly from Heartland MLS Matrix.
// Requires valid session cookies in MLS_MATRIX_COOKIES env var.
// ---------------------------------------------------------------------------
app.get('/listing/:mlsNumber', async (req, res) => {
  const { mlsNumber } = req.params;

  if (!mlsNumber || !mlsNumber.trim()) {
    return res.status(400).json({
      error: 'mlsNumber is required',
      message: 'If there is no MLS number the property is not on the MLS',
    });
  }

  const cookies = getCookies();
  if (cookies.length === 0) {
    return res.status(503).json({
      error: 'no_cookies',
      message: 'MLS_MATRIX_COOKIES env var is not set. Session not available.',
    });
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    });

    await context.addCookies(cookies);
    const page = await context.newPage();

    // -----------------------------------------------------------------------
    // Navigate to Matrix quick search
    // -----------------------------------------------------------------------
    await page.goto('https://hmls.mlsmatrix.com/Matrix/Search/Residential/Quick', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Check if we were redirected to the SSO login page (session expired)
    const currentUrl = page.url();
    if (currentUrl.includes('clareityiam') || currentUrl.includes('/login') || currentUrl.includes('/Login')) {
      await browser.close();
      return res.status(401).json({
        error: 'session_expired',
        message: 'Heartland MLS session has expired. Re-authentication required.',
      });
    }

    // -----------------------------------------------------------------------
    // Use the shorthand/speedbar to search by MLS#
    // -----------------------------------------------------------------------
    const speedbarSelector = 'input[placeholder*="Shorthand"], input[placeholder*="MLS"], #m_ucSearchBar_txtSearch, input[title*="search"]';

    try {
      await page.waitForSelector(speedbarSelector, { timeout: 10000 });
    } catch {
      // Try to find any input at the top
    }

    const speedbar = await page.$(speedbarSelector);
    if (speedbar) {
      await speedbar.fill(mlsNumber.trim());
      await speedbar.press('Enter');
    } else {
      // Fallback: evaluate to find and fill the speedbar
      await page.evaluate((mls) => {
        const inputs = document.querySelectorAll('input[type="text"]');
        for (const inp of inputs) {
          const ph = (inp.placeholder || '').toLowerCase();
          const title = (inp.title || '').toLowerCase();
          if (ph.includes('shorthand') || ph.includes('mls') || title.includes('search')) {
            inp.value = mls;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
            inp.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
            break;
          }
        }
      }, mlsNumber.trim());
    }

    // Wait for results page to load
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // -----------------------------------------------------------------------
    // Check results and click first listing
    // -----------------------------------------------------------------------
    const resultsUrl = page.url();

    // Look for a link to the first result listing
    // Matrix result rows typically have a link that contains the MLS# or address
    const listingLinkClicked = await page.evaluate((mls) => {
      // Try various selectors Matrix uses for result row links
      const selectors = [
        `a[href*="Listing"]`,
        `td.col-prop-address a`,
        `.result-row a`,
        `table.results a`,
        `#m_rptResults a`,
      ];
      for (const sel of selectors) {
        const links = document.querySelectorAll(sel);
        if (links.length > 0) {
          links[0].click();
          return true;
        }
      }
      // Last resort: find any link that looks like a property address
      const allLinks = document.querySelectorAll('a');
      for (const link of allLinks) {
        const href = link.href || '';
        if (href.includes('OneLineSearch') || href.includes('listing') || href.includes('Listing')) {
          link.click();
          return true;
        }
      }
      return false;
    }, mlsNumber.trim());

    if (!listingLinkClicked) {
      // Maybe we're already on the listing detail (1 result auto-expanded)
      // Or no results found
      const bodyText = await page.textContent('body');
      if (bodyText.toLowerCase().includes('no results') || bodyText.toLowerCase().includes('no listings')) {
        await browser.close();
        return res.json({ found: false, message: `No listing found for MLS# ${mlsNumber}` });
      }
    }

    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // -----------------------------------------------------------------------
    // Scrape the listing detail page
    // -----------------------------------------------------------------------
    const listingData = await page.evaluate(() => {
      const text = document.body.innerText;
      const html = document.body.innerHTML;

      function extractAfterLabel(label) {
        // Look for label: value pattern in page text
        const patterns = [
          new RegExp(label + '\\s*:?\\s*([^\\n\\t]+)', 'i'),
        ];
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) return match[1].trim();
        }
        return null;
      }

      function extractTableCell(labelText) {
        // Find a cell whose text matches the label, return the next cell's text
        const tds = document.querySelectorAll('td, th, span, div');
        for (let i = 0; i < tds.length; i++) {
          const cellText = (tds[i].textContent || '').trim();
          if (cellText.toLowerCase() === labelText.toLowerCase() || cellText.toLowerCase().startsWith(labelText.toLowerCase() + ':')) {
            // Try next sibling or parent's next sibling
            const next = tds[i + 1];
            if (next) return (next.textContent || '').trim();
            const parentNext = tds[i].parentElement && tds[i].parentElement.nextElementSibling;
            if (parentNext) return (parentNext.textContent || '').trim();
          }
        }
        return null;
      }

      // Extract address from page heading
      const h1 = document.querySelector('h1, h2, .address, [class*="address"]');
      const headingText = h1 ? h1.textContent.trim() : null;

      // Parse address components
      let address = null, city = null, state = null, zipCode = null;
      if (headingText) {
        // Format: "1011 Tam Oshanter Drive, Kansas City, MO 64145"
        const addrMatch = headingText.match(/^(.+),\s*(.+),\s*([A-Z]{2})\s*(\d{5})/);
        if (addrMatch) {
          address = addrMatch[1].trim();
          city = addrMatch[2].trim();
          state = addrMatch[3].trim();
          zipCode = addrMatch[4].trim();
        }
      }

      // Extract key fields using multiple strategies
      const county = extractAfterLabel('County') || extractTableCell('County');
      const lglRaw = extractAfterLabel('Lgl') || extractAfterLabel('Legal') || extractTableCell('Lgl') || extractTableCell('Legal Desc');
      const subRaw = extractAfterLabel('Sub') || extractTableCell('Sub') || extractTableCell('Subdivision');
      const priceRaw = extractAfterLabel('L Price') || extractTableCell('L Price') || extractTableCell('List Price');
      const statusRaw = extractAfterLabel('Status') || extractTableCell('Status');
      const mlsRaw = extractAfterLabel('MLS#') || extractTableCell('MLS#');
      const bedsRaw = extractAfterLabel('Bed') || extractTableCell('Bed');
      const bathsRaw = extractAfterLabel('Full Bath') || extractTableCell('Full Bath');
      const sqftRaw = extractAfterLabel('Above Grade Fin') || extractTableCell('Above Grade Fin');
      const yearRaw = extractAfterLabel('Yr Blt') || extractTableCell('Yr Blt');
      const lotRaw = extractAfterLabel('Lsz') || extractTableCell('Lsz');
      const typeRaw = extractAfterLabel('Type') || extractTableCell('Type');
      const styleRaw = extractAfterLabel('Style') || extractTableCell('Style');
      const garageRaw = extractAfterLabel('Gar') || extractTableCell('Gar') || extractTableCell('Garage');

      function cleanPrice(raw) {
        if (!raw) return null;
        return raw.replace(/[^0-9.]/g, '') || null;
      }

      return {
        address,
        city,
        state,
        zipCode,
        county: county ? county.replace(/\s+/g, ' ').trim() : null,
        legalDescription: lglRaw ? lglRaw.replace(/\s+/g, ' ').trim() : null,
        subdivision: subRaw ? subRaw.replace(/\s+/g, ' ').trim() : null,
        listPrice: priceRaw ? cleanPrice(priceRaw) : null,
        listPriceRaw: priceRaw,
        status: statusRaw ? statusRaw.trim() : null,
        mlsNumber: mlsRaw ? mlsRaw.trim() : null,
        bedrooms: bedsRaw ? bedsRaw.trim() : null,
        bathsFull: bathsRaw ? bathsRaw.trim() : null,
        sqftAboveGrade: sqftRaw ? sqftRaw.trim() : null,
        yearBuilt: yearRaw ? yearRaw.trim() : null,
        lotSize: lotRaw ? lotRaw.trim() : null,
        propertyType: typeRaw ? typeRaw.trim() : null,
        style: styleRaw ? styleRaw.trim() : null,
        garage: garageRaw ? garageRaw.trim() : null,
        _pageUrl: window.location.href,
        _scrapedAt: new Date().toISOString(),
      };
    });

    await browser.close();

    // Check if we got meaningful data
    if (!listingData.address && !listingData.county && !listingData.legalDescription) {
      return res.status(404).json({
        found: false,
        message: `Could not extract listing data for MLS# ${mlsNumber}. Session may be expired or listing not found.`,
        _pageUrl: listingData._pageUrl,
      });
    }

    return res.json({
      found: true,
      data: listingData,
    });
  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    console.error('Error fetching listing:', err);
    return res.status(500).json({
      error: 'scrape_error',
      message: err.message,
    });
  }
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`MLS Listing Fetcher running on port ${PORT}`);
});
