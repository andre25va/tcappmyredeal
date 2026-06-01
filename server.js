// server.js — MLS Property Fetcher v5
// Endpoints:
//   GET /health           — health check
//   GET /property?address=... — look up property via Realist API + Playwright legal desc fallback
//   GET /listing/:mlsNumber  — legacy (deprecated, 410)
//
// Architecture:
//   1. Fast path: Matrix SSO → Realist SESSION cookie → direct API calls (2-3s)
//      Returns: zip, county, apn, owner, city, state, address, subdivision, etc.
//      NOTE: quick-search API only returns 12 base fields; LEGAL_DESCRIPTION is always null
//   2. Legal desc fallback: spawn realist_scrape_v6.js (Clareity SSO → Playwright → Report page)
//      Runs when legal is null; takes ~60-90s; uses saved Clareity cookies (no MFA if fresh)

const express = require('express');
const https = require('https');
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
const PORT = 4000;
const SCRAPER_PATH = path.join(__dirname, 'realist_scrape_v6.js');
const SCRAPER_RESULT_FILE = '/tmp/realist_result.json';

// ─── Cookie cache (Matrix SSO) ────────────────────────────────────────────────
let realistCookieHeader = null;
let cookieExpiry = 0;
const COOKIE_TTL_MS = 50 * 60 * 1000; // 50 minutes

// ─── Playwright scraper lock (prevent concurrent runs) ────────────────────────
let scraperRunning = false;
let scraperQueue = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function httpGet(url, cookieHeader) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'Cookie': cookieHeader,
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Referer': 'https://prd.realist.com/search'
      },
      timeout: 15000
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function httpPost(url, bodyObj, cookieHeader) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(bodyObj);
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Referer': 'https://prd.realist.com/search',
        'Origin': 'https://prd.realist.com'
      },
      timeout: 15000
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(postData);
    req.end();
  });
}

// ─── SSO: Get Realist SESSION cookie via Matrix ───────────────────────────────
async function getRealistSession() {
  if (realistCookieHeader && Date.now() < cookieExpiry) {
    console.log('[cache] Using cached Realist session');
    return realistCookieHeader;
  }

  console.log('[sso] Refreshing Realist session via Matrix SSO...');
  const mlsCookiesRaw = process.env.MLS_MATRIX_COOKIES || fs.readFileSync('/tmp/mls_cookies_fresh.json', 'utf8').trim();
  let mlsCookies;
  try {
    mlsCookies = JSON.parse(mlsCookiesRaw);
  } catch(e) {
    throw new Error('Failed to parse MLS cookies: ' + e.message);
  }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    await context.addCookies(mlsCookies);
    const page = await context.newPage();

    await page.goto('https://hmls.mlsmatrix.com/Matrix/special/thirdpartyformpost.aspx?n=REALISTA', {
      waitUntil: 'domcontentloaded', timeout: 30000
    });
    await page.waitForTimeout(4000);
    await page.goto('https://prd.realist.com/dashboard', { waitUntil: 'commit', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(6000);

    const cookies = await context.cookies('https://prd.realist.com');
    const sessionCookie = cookies.find(c => c.name === 'SESSION');
    if (!sessionCookie) throw new Error('No Realist SESSION cookie after SSO');

    realistCookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    cookieExpiry = Date.now() + COOKIE_TTL_MS;
    console.log('[sso] Realist session refreshed successfully');
    return realistCookieHeader;
  } finally {
    await browser.close();
  }
}

// ─── Playwright scraper: get legal description via Clareity SSO ───────────────
// Spawns realist_scrape_v6.js as a child process.
// Uses a lock so only one scrape runs at a time — concurrent requests queue up.
function getLegalDescriptionViaPlaywright(address, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const runScrape = () => {
      scraperRunning = true;
      console.log(`[playwright] Starting scraper for: "${address}"`);

      const proc = spawn('node', [SCRAPER_PATH, address], {
        cwd: __dirname,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      proc.stdout.on('data', d => { stdout += d; process.stdout.write('[scraper] ' + d); });
      proc.stderr.on('data', d => process.stderr.write('[scraper] ' + d));

      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        console.log('[playwright] Timeout — no legal description');
        finalize(null);
      }, timeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timer);
        let legal = null;
        try {
          const result = JSON.parse(fs.readFileSync(SCRAPER_RESULT_FILE, 'utf8'));
          legal = result.legal || null;
          console.log(`[playwright] Legal from scraper: "${legal}"`);
        } catch {
          console.log('[playwright] Could not read result file');
        }
        finalize(legal);
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        console.log('[playwright] Spawn error:', err.message);
        finalize(null);
      });
    };

    const finalize = (legal) => {
      scraperRunning = false;
      resolve(legal);
      // Run next queued scrape if any
      if (scraperQueue.length > 0) {
        const next = scraperQueue.shift();
        next();
      }
    };

    if (!scraperRunning) {
      runScrape();
    } else {
      console.log('[playwright] Scraper busy — queueing request for:', address);
      scraperQueue.push(runScrape);
    }
  });
}

// ─── Realist property lookup (fast API path) ──────────────────────────────────
const DISPLAY_FIELDS = [
  "APN", "COUNTY", "PROPERTY_HOUSE_NUMBER", "PROPERTY_STREET_NAME",
  "PROPERTY_ADDRESS_MODE", "PROPERTY_PRE_DIRECTION", "PROPERTY_POST_DIRECTION",
  "PROPERTY_CITY_NAME", "PROPERTY_STATE_NAME", "PROPERTY_ZIP_CODE", "PROPERTY_ZIP4",
  "OWNER_NAME_1", "OWNER_NAME_2", "SUBDIVISION_NAME", "LEGAL_LOT", "LEGAL_DESCRIPTION",
  "LEGAL_BLOCK", "SECTION_CD", "TOWNSHIP", "RANGE_CD", "TRACT_NUMBER",
  "YEAR_BUILT", "LOT_ACRES", "LOT_SQUARE_FEET", "TOTAL_BUILDING_AREA",
  "BEDROOMS", "TOTAL_BATHS", "FIPS_CODE", "PARCEL_ID", "PARCEL_SEQ_NUMBER",
  "RECORDING_DATE", "SALE_DATE", "ACTUAL_SALE_PRICE", "TOTAL_ASSESSED_VALUE",
  "PROPERTY_TAX_AMOUNT", "ZONING", "SCHOOL_DISTRICT_NAME"
];

async function lookupPropertyByAddress(address) {
  const cookieHeader = await getRealistSession();

  // Type-ahead to normalize address
  const taRes = await httpGet(
    `https://prd.realist.com/api/get-type-ahead?address=${encodeURIComponent(address)}`,
    cookieHeader
  );
  if (taRes.status !== 200) throw new Error(`Type-ahead failed: ${taRes.status}`);
  const addresses = JSON.parse(taRes.body);
  if (!addresses.length) return null;
  const standardizedAddress = addresses[0];

  // Quick search
  const qsBody = {
    searchFields: [{ fieldCode: 'SITE_ADDRESS', operatorValues: [{ operator: 'STARTS_WITH', values: [standardizedAddress] }] }],
    displayFields: DISPLAY_FIELDS,
    totalRecords: 10
  };
  const qsRes = await httpPost('https://prd.realist.com/api/quick-search', qsBody, cookieHeader);
  console.log('[DEBUG] QS response (first 1000):', qsRes.body.substring(0, 1000));

  if (qsRes.status === 401 || qsRes.status === 403) {
    console.log('[retry] Session expired, refreshing...');
    realistCookieHeader = null;
    cookieExpiry = 0;
    return lookupPropertyByAddress(address);
  }
  if (qsRes.status !== 200) throw new Error(`Quick search failed: ${qsRes.status} ${qsRes.body.substring(0, 200)}`);

  const qsData = JSON.parse(qsRes.body);
  const props = qsData.propertySummaryList;
  if (!props || !props.length) return null;

  const pd = props[0].propertyData;
  const pid = props[0].propertyIdentifier;

  console.log('[DEBUG] Realist fields:', JSON.stringify(Object.keys(pd)));
  console.log('[DEBUG] LEGAL fields:', JSON.stringify({ LEGAL_DESCRIPTION: pd.LEGAL_DESCRIPTION, LEGAL_LOT: pd.LEGAL_LOT, LEGAL_BLOCK: pd.LEGAL_BLOCK, SUBDIVISION_NAME: pd.SUBDIVISION_NAME }));

  const streetNum = pd.PROPERTY_HOUSE_NUMBER || '';
  const preDir = pd.PROPERTY_PRE_DIRECTION || '';
  const streetName = pd.PROPERTY_STREET_NAME || '';
  const addressMode = pd.PROPERTY_ADDRESS_MODE || '';
  const postDir = pd.PROPERTY_POST_DIRECTION || '';
  const fullStreet = [streetNum, preDir, streetName, addressMode, postDir].filter(Boolean).join(' ');

  // Build legal from API fields (quick-search usually returns null for LEGAL_DESCRIPTION)
  const legalFromApi = pd.LEGAL_DESCRIPTION ||
    [
      pd.SUBDIVISION_NAME,
      pd.LEGAL_BLOCK && ('Block ' + pd.LEGAL_BLOCK),
      pd.LEGAL_LOT && ('Lot ' + pd.LEGAL_LOT),
      pd.TRACT_NUMBER && ('Tract ' + pd.TRACT_NUMBER),
      pd.SECTION_CD && ('Sec ' + pd.SECTION_CD),
      pd.TOWNSHIP && ('Twp ' + pd.TOWNSHIP),
      pd.RANGE_CD && ('Rng ' + pd.RANGE_CD)
    ].filter(Boolean).join(', ').trim() || null;

  return {
    address: fullStreet,
    city: pd.PROPERTY_CITY_NAME || '',
    state: pd.PROPERTY_STATE_NAME || '',
    zip: pd.PROPERTY_ZIP_CODE || '',
    county: pd.COUNTY ? pd.COUNTY.charAt(0).toUpperCase() + pd.COUNTY.slice(1).toLowerCase() : '',
    apn: pd.APN || pid.apn || '',
    owner: pd.OWNER_NAME_1 || '',
    owner2: pd.OWNER_NAME_2 || '',
    legal: legalFromApi,
    subdivision: pd.SUBDIVISION_NAME || '',
    yearBuilt: pd.YEAR_BUILT || '',
    lotSqft: pd.LOT_SQUARE_FEET || '',
    bedrooms: pd.BEDROOMS || '',
    baths: pd.TOTAL_BATHS || '',
    assessedValue: pd.TOTAL_ASSESSED_VALUE || '',
    taxAmount: pd.PROPERTY_TAX_AMOUNT || '',
    schoolDistrict: pd.SCHOOL_DISTRICT_NAME || '',
    parcelId: pid.parcelId || '',
    fipsCode: pid.fipsCode || '',
    latitude: pid.latitude || null,
    longitude: pid.longitude || null,
    source: 'realist'
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: 4,
    sessionCached: !!(realistCookieHeader && Date.now() < cookieExpiry),
    scraperRunning,
    scraperQueued: scraperQueue.length
  });
});

app.get('/property', async (req, res) => {
  const { address, skipScraper } = req.query;
  if (!address) return res.status(400).json({ error: 'address query param required' });

  try {
    console.log(`[property] Lookup: "${address}"`);

    // Step 1: Fast API lookup (~2-3s)
    const result = await lookupPropertyByAddress(address);
    if (!result) return res.status(404).json({ error: 'Property not found', address });
    console.log(`[property] API result: ${result.address}, ${result.city} ${result.zip}, legal: ${result.legal}`);

    // Step 2: If legal is still null, use Playwright scraper (~60-90s)
    // skipScraper=1 to skip (for fast lookups where legal isn't needed)
    if (!result.legal && skipScraper !== '1') {
      console.log('[property] Legal null from API — running Playwright scraper...');
      const legalFromPlaywright = await getLegalDescriptionViaPlaywright(address);
      if (legalFromPlaywright) {
        result.legal = legalFromPlaywright;
        result.legalSource = 'playwright';
        console.log(`[property] Legal from Playwright: "${result.legal}"`);
      } else {
        result.legalSource = 'none';
      }
    } else if (result.legal) {
      result.legalSource = 'api';
    }

    res.json(result);
  } catch (err) {
    console.error('[property] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Legacy endpoint
app.get('/listing/:mlsNumber', async (req, res) => {
  res.status(410).json({
    error: 'MLS listing lookup deprecated. Use /property?address=... instead',
    upgrade: '/property?address=PROPERTY_ADDRESS'
  });
});

// Debug endpoint
app.get('/debug-detail', async (req, res) => {
  try {
    const cookieHeader = await getRealistSession();
    const clip = '5207978071';
    const fips = '29095';
    const parcel = '65940041500000000';

    const postEndpoints = [
      { url: 'https://prd.realist.com/api/property-report', body: { clip, fipsCode: fips, parcelId: parcel, parcelSeqNumber: '1' } },
      { url: 'https://prd.realist.com/api/property-details', body: { clip } },
    ];

    const results = {};
    for (const ep of postEndpoints) {
      const r = await httpPost(ep.url, ep.body, cookieHeader).catch(e => ({ status: 0, body: e.message }));
      results[ep.url] = { status: r.status, preview: r.body.substring(0, 600) };
    }
    res.json(results);
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ─── MLS# → Address resolution via OpenAI Responses API ────────────────────
app.post('/resolve-mls', async (req, res) => {
  try {
    const { mlsNumber, apiKey } = req.body;
    if (!mlsNumber) return res.status(400).json({ error: 'mlsNumber required' });
    if (!apiKey) return res.status(400).json({ error: 'apiKey required' });

    console.log(`[resolve-mls] Looking up MLS# ${mlsNumber}...`);

    const prompt = `Search Zillow, Realtor.com, Redfin, or any real estate website for MLS listing number ${mlsNumber} in the Kansas City metro area (Heartland MLS, Missouri and Kansas).
Find a page that shows "MLS #${mlsNumber}" or "MLS: ${mlsNumber}" or "MLS${mlsNumber}".
Return ONLY a valid JSON object with NO explanation:
{"address": "123 Main St", "city": "Kansas City", "state": "MO", "zip": "64112"}
If not found, return: null`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        tools: [{ type: 'web_search_preview' }],
        input: prompt
      }),
      signal: AbortSignal.timeout(90000)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[resolve-mls] OpenAI error ${response.status}: ${errText.substring(0,300)}`);
      return res.json({ found: false, error: `OpenAI ${response.status}` });
    }

    const data = await response.json();
    // Extract text from Responses API output format
    const text = (data.output || [])
      .filter(i => i.type === 'message')
      .flatMap(i => i.content || [])
      .filter(c => c.type === 'output_text')
      .map(c => c.text).join('').trim();

    console.log(`[resolve-mls] Raw OpenAI response: ${text.substring(0, 300)}`);

    if (!text || text.toLowerCase() === 'null') {
      return res.json({ found: false });
    }

    const jsonText = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      const parsed = JSON.parse(jsonText);
      if (parsed?.address) {
        console.log(`[resolve-mls] Resolved: ${JSON.stringify(parsed)}`);
        return res.json({ found: true, ...parsed });
      }
    } catch(e) {
      console.warn('[resolve-mls] JSON parse failed:', e.message, 'text:', text.substring(0,100));
    }
    return res.json({ found: false });
  } catch (err) {
    console.error('[resolve-mls] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`MLS Property Fetcher v5 running on port ${PORT}`);
  console.log('Endpoints: GET /health, GET /property?address=... [&skipScraper=1]');

  // Warm up Realist session on startup
  setTimeout(() => {
    getRealistSession()
      .then(() => console.log('[startup] Realist session warmed up'))
      .catch(e => console.error('[startup] Session warm-up failed:', e.message));
  }, 5000);

  // Keep session warm — refresh every 45 minutes
  setInterval(() => {
    realistCookieHeader = null;
    cookieExpiry = 0;
    getRealistSession()
      .then(() => console.log('[refresh] Realist session refreshed'))
      .catch(e => console.error('[refresh] Session refresh failed:', e.message));
  }, 45 * 60 * 1000);
});
