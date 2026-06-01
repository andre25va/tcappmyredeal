// Realist property scraper v6 — OpenAI-advised rebuild
// Key improvements over v5:
//   1. MutationObserver + setInterval injected into Realist SPA to permanently dismiss survey
//   2. page.route() blocks survey-related network requests
//   3. Angular mat-checkbox: click .mat-checkbox-inner-container (the real clickable area)
//   4. page.waitForFunction() polls until Proceed button is enabled (not just a timeout)
//   5. All post-auth clicks use page.evaluate() to bypass z-index and Angular state issues
//   6. ArrowDown + Enter fallback for autocomplete to avoid click interception
// Usage: node realist_scrape_v6.js "1011 Tam Oshanter Drive, Kansas City, MO 64145"

const { chromium } = require('playwright');
const fs = require('fs');

const ADDRESS = process.argv[2] || '1011 Tam Oshanter Drive, Kansas City, MO 64145';
const MFA_FILE = '/tmp/mfa_code.txt';
const COOKIES_FILE = '/root/playwright-cookies.json';

// ── Consistent device fingerprint (same every run so Clareity recognizes device) ──
const DEVICE = {
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 720 },
  timezoneId: 'America/Chicago',
  locale: 'en-US',
};

async function waitForMFA() {
  console.log('[MFA] Waiting up to 120s for code in /tmp/mfa_code.txt...');
  for (let i = 0; i < 120; i++) {
    if (fs.existsSync(MFA_FILE)) {
      const code = fs.readFileSync(MFA_FILE, 'utf8').trim();
      if (code && code.length >= 4) {
        fs.unlinkSync(MFA_FILE);
        return code;
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('MFA code timeout — write code to /tmp/mfa_code.txt');
}

async function saveCookies(context) {
  const cookies = await context.cookies();
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
  console.log(`[COOKIES] Saved ${cookies.length} cookies`);
}

async function loadCookies(context) {
  if (!fs.existsSync(COOKIES_FILE)) return false;
  const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
  if (!cookies.length) return false;
  await context.addCookies(cookies);
  console.log(`[COOKIES] Loaded ${cookies.length} saved cookies`);
  return true;
}

// ── Inject persistent survey killer into current page ─────────────────────────
// Uses MutationObserver + setInterval so it catches the survey no matter when it appears.
// Works across Angular SPA route changes since the DOM observer persists.
async function injectSurveyKiller(page) {
  await page.evaluate(() => {
    if (window.__surveyKillerInjected) return;
    window.__surveyKillerInjected = true;

    function killSurvey() {
      try {
        // Strategy 1: find rlst-survey and click its No/Decline button
        const survey = document.querySelector('rlst-survey, [class*="survey" i]');
        if (survey && survey.offsetParent !== null) { // visible
          const btns = Array.from(survey.querySelectorAll('button'));
          const noBtn = btns.find(b => /^(no|no[, ]thanks|decline|close)$/i.test(b.textContent.trim()));
          if (noBtn) { noBtn.click(); console.log('[SURVEY-KILLER] Dismissed via No button'); return; }
          // If only one button, click it to dismiss
          if (btns.length === 1) { btns[0].click(); return; }
        }

        // Strategy 2: look for any overlay/modal that has only Yes/No buttons
        const overlays = document.querySelectorAll('[class*="overlay" i], [class*="modal" i], [class*="dialog" i]');
        for (const overlay of overlays) {
          if (!overlay.offsetParent) continue; // not visible
          const text = overlay.textContent || '';
          if (!text.toLowerCase().includes('survey') && !text.toLowerCase().includes('experience') && !text.toLowerCase().includes('cotality')) continue;
          const btns = Array.from(overlay.querySelectorAll('button'));
          const noBtn = btns.find(b => /^(no|no[, ]thanks|decline)$/i.test(b.textContent.trim()));
          if (noBtn) { noBtn.click(); console.log('[SURVEY-KILLER] Dismissed overlay survey'); return; }
        }
      } catch(e) {}
    }

    // Watch DOM for survey appearing
    const observer = new MutationObserver(() => { setTimeout(killSurvey, 50); });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Poll every 800ms as safety net
    setInterval(killSurvey, 800);

    // Run immediately
    killSurvey();
    console.log('[SURVEY-KILLER] Injected');
  });
  console.log('[SURVEY-KILLER] Injection complete');
}

// ── Main scrape function (post-auth, already on prd.realist.com) ──────────────
async function scrapeRealist(page, address, context) {
  console.log('[SCRAPE] Starting — address:', address);
  await page.screenshot({ path: '/tmp/s7_start.png' });

  // Block any survey/analytics network requests
  try {
    await page.route(/survey|cotality-survey|feedback|qualtrics/i, route => {
      console.log('[ROUTE] Blocking:', route.request().url().substring(0, 80));
      route.abort();
    });
  } catch {}

  // Inject persistent survey killer into the SPA
  await injectSurveyKiller(page);
  await page.waitForTimeout(1000);

  // ── STEP 7: Search address ───────────────────────────────────────────────────
  console.log('[7] Searching:', address);

  // Wait for Angular Material search input
  await page.waitForSelector('#mat-input-0', { timeout: 20000 });
  await page.waitForTimeout(500);

  // Focus and fill (use triple-click to clear, then type)
  await page.click('#mat-input-0', { force: true });
  await page.waitForTimeout(300);
  await page.fill('#mat-input-0', '');
  await page.waitForTimeout(200);
  await page.type('#mat-input-0', address, { delay: 60 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/s7_typed.png' });

  // Wait for autocomplete panel
  const autoSel = 'mat-option, [role="option"], .mat-autocomplete-panel .mat-option, .mat-option';
  let suggText = null;
  try {
    await page.waitForSelector(autoSel, { timeout: 8000 });
    const options = await page.$$(autoSel);
    if (options.length > 0) {
      suggText = await options[0].innerText().catch(() => '');
      console.log('[7] Autocomplete option:', suggText.trim());
      // Click first option
      await options[0].click({ force: true });
    } else {
      throw new Error('No options');
    }
  } catch {
    console.log('[7] No autocomplete panel — using ArrowDown+Enter');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/s7b_after_search.png' });
  console.log('[7] After search URL:', page.url());

  // ── STEP 8: Handle Property Suggestion modal ─────────────────────────────────
  console.log('[8] Checking for Property Suggestion modal...');
  await page.waitForTimeout(1000);
  await injectSurveyKiller(page); // re-inject in case Angular reloaded
  await page.screenshot({ path: '/tmp/s8_modal_check.png' });

  // Detect modal (Angular Material dialog)
  const modalVisible = await page.evaluate(() => {
    const dialog = document.querySelector('mat-dialog-container, [role="dialog"], .cdk-overlay-container .cdk-overlay-pane');
    return dialog ? dialog.offsetParent !== null || dialog.getBoundingClientRect().width > 0 : false;
  });
  console.log('[8] Modal visible:', modalVisible);

  // Dump all buttons for debugging
  const allBtns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t.length > 0)
  );
  console.log('[8] All buttons:', JSON.stringify(allBtns.slice(0, 20)));

  // ── Check the mat-checkbox ──
  // Angular Material renders: mat-checkbox > label > .mat-checkbox-inner-container > input[type=checkbox]
  // The .mat-checkbox-inner-container is the clickable visual element
  // Angular listens on the hidden input for change events
  const cbResult = await page.evaluate(() => {
    // Priority 1: click .mat-checkbox-inner-container (visual click area)
    const inner = document.querySelector(
      'mat-dialog-container .mat-checkbox-inner-container, ' +
      '[role="dialog"] .mat-checkbox-inner-container, ' +
      '.cdk-overlay-container .mat-checkbox-inner-container, ' +
      'mat-checkbox .mat-checkbox-inner-container'
    );
    if (inner) {
      inner.click();
      return { method: 'inner-container', found: true };
    }

    // Priority 2: dispatch click + change on hidden input
    const hiddenInput = document.querySelector(
      'mat-dialog-container input[type="checkbox"], ' +
      '[role="dialog"] input[type="checkbox"], ' +
      '.cdk-overlay-container input[type="checkbox"], ' +
      'mat-checkbox input[type="checkbox"]'
    );
    if (hiddenInput) {
      hiddenInput.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
      return { method: 'hidden-input-dispatch', found: true };
    }

    // Priority 3: click mat-checkbox element itself (Angular handles it)
    const matCb = document.querySelector(
      'mat-dialog-container mat-checkbox, [role="dialog"] mat-checkbox, .cdk-overlay-container mat-checkbox'
    );
    if (matCb) {
      matCb.click();
      return { method: 'mat-checkbox-element', found: true };
    }

    return { method: 'none', found: false };
  });
  console.log('[8] Checkbox click result:', JSON.stringify(cbResult));

  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/s8_after_cb.png' });

  // ── Wait for Proceed button to be enabled ──
  console.log('[8] Waiting for Proceed button to be enabled...');
  let proceedEnabled = false;
  try {
    await page.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const proceed = btns.find(b => /^proceed$/i.test(b.textContent.trim()));
      return proceed && !proceed.disabled && !proceed.hasAttribute('disabled');
    }, { timeout: 8000 });
    proceedEnabled = true;
    console.log('[8] Proceed is now enabled!');
  } catch {
    console.log('[8] Proceed still disabled after wait — attempting anyway');
  }

  // ── If still disabled, try checking checkbox again with a different method ──
  if (!proceedEnabled) {
    console.log('[8] Retry: trying to check checkbox via Angular NgModel...');
    const retryResult = await page.evaluate(() => {
      // Try clicking the label element of the mat-checkbox (Angular attaches the toggle to label click)
      const label = document.querySelector(
        'mat-dialog-container mat-checkbox label, [role="dialog"] mat-checkbox label, .cdk-overlay-container mat-checkbox label'
      );
      if (label) { label.click(); return 'label-click'; }

      // Try row click (sometimes clicking the row toggles the checkbox)
      const row = document.querySelector('mat-dialog-container tbody tr:first-child, [role="dialog"] tbody tr:first-child');
      if (row) { row.click(); return 'row-click'; }

      return 'nothing';
    });
    console.log('[8] Retry result:', retryResult);
    await page.waitForTimeout(1500);
  }

  await page.screenshot({ path: '/tmp/s8b_before_proceed.png' });

  // ── Click Proceed via evaluate ──
  const proceedClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => /^proceed$/i.test(b.textContent.trim()));
    if (btn) {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      btn.click();
      return btn.disabled ? 'clicked-but-disabled' : 'clicked-enabled';
    }
    return 'not-found';
  });
  console.log('[8] Proceed click result:', proceedClicked);

  await page.waitForTimeout(4000);
  await page.screenshot({ path: '/tmp/s9_after_proceed.png' });
  console.log('[9] After Proceed URL:', page.url());

  // ── STEP 9: Get to the property Report page ──────────────────────────────────
  // After Proceed, Realist shows the Map view with 1 match.
  // The bottom action bar has "Reports >" button → click that to open the Realist Report.
  // Alternative: switch to List view → click first row → then Report tab in the detail panel.
  console.log('[9] Looking for Reports button/link...');
  await injectSurveyKiller(page);

  // Dump all visible clickable elements
  const allLinks = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a, button, [role="tab"], mat-tab-link, [class*="report" i]'))
      .map(el => ({ text: el.textContent.trim(), tag: el.tagName, cls: el.className.substring(0,50) }))
      .filter(el => el.text.length > 0 && el.text.length < 60)
  );
  console.log('[9] All links/buttons:', JSON.stringify(allLinks.slice(0, 40)));

  // Strategy 1: Click "Reports >" in the bottom action bar
  const reportsClicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('a, button, span, div'));
    const el = els.find(e =>
      /^reports\s*[>»]?$/i.test(e.textContent.trim()) ||
      /^reports$/i.test(e.textContent.trim())
    );
    if (el) { el.click(); return el.textContent.trim(); }
    return false;
  });
  console.log('[9] Reports click result:', reportsClicked);

  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/s9b_after_reports.png' });
  console.log('[9b] After Reports click URL:', page.url());

  // Strategy 2: If still on /search, try List view → click first row → Report tab
  if (page.url().includes('/search') && !reportsClicked) {
    console.log('[9] Trying List view approach...');

    // Switch to List view
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, a, [role="tab"]'));
      const listBtn = els.find(e => /^list$/i.test(e.textContent.trim()));
      if (listBtn) listBtn.click();
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/s9c_list_view.png' });

    // Click first row in list
    await page.evaluate(() => {
      const row = document.querySelector('tbody tr:first-child td:first-child, .property-row:first-child, [class*="result-row"]:first-child');
      if (row) row.click();
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/s9d_row_click.png' });

    // Now look for Report tab in the detail panel
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a, button, [role="tab"], mat-tab-link, .mat-tab-link'));
      const reportEl = els.find(el => /^report$/i.test(el.textContent.trim()));
      if (reportEl) reportEl.click();
    });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/s9e_report_tab.png' });
  }

  // Strategy 3: If a new page opened (report in new tab), switch to it
  const pages = context.pages();
  console.log('[9] Open pages:', pages.length);
  if (pages.length > 1) {
    // Switch to the latest page (report)
    const reportPage = pages[pages.length - 1];
    await reportPage.waitForLoadState('domcontentloaded', { timeout: 30000 });
    await reportPage.waitForTimeout(2000);
    page = reportPage;
    console.log('[9] Switched to report page:', page.url());
  }

  await page.screenshot({ path: '/tmp/s10_report.png' });
  console.log('[10] Report page URL:', page.url());

  // ── STEP 10: Scrape legal description ────────────────────────────────────────
  console.log('[10] Scraping legal description...');
  await injectSurveyKiller(page);
  await page.waitForTimeout(2000);

  const bodyText = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync('/tmp/realist_page_text.txt', bodyText);

  let legal = null;

  // Strategy 1: find element after "Legal Description" label
  legal = await page.evaluate(() => {
    const allEls = Array.from(document.querySelectorAll('*'));
    for (const el of allEls) {
      if (el.children.length > 0) continue; // skip containers
      const text = el.textContent.trim();
      if (/^legal\s*description$/i.test(text)) {
        // look at siblings and parent
        const parent = el.closest('tr, .field-row, .property-row, li, dl');
        if (parent) {
          const next = parent.nextElementSibling;
          if (next) return next.textContent.trim();
          const tds = parent.querySelectorAll('td, dd, .value');
          if (tds.length >= 2) return tds[1].textContent.trim();
        }
        // Try next sibling of the label element itself
        let sib = el.nextElementSibling;
        if (sib) return sib.textContent.trim();
      }
    }
    return null;
  });
  console.log('[10] Strategy 1 (label search):', legal ? legal.substring(0, 80) : 'null');

  // Strategy 2: regex on body text
  if (!legal) {
    const m = bodyText.match(/legal\s*description[:\s\n]+([^\n]{10,400})/i);
    if (m) legal = m[1].trim();
    console.log('[10] Strategy 2 (regex):', legal ? legal.substring(0, 80) : 'null');
  }

  // Strategy 3: find LOT/BLOCK/SUBDIVISION pattern
  if (!legal) {
    const m2 = bodyText.match(/((?:LOT|BLOCK|SUBDIVISION|SECTION|TRACT|PLAT)\s+[A-Z0-9\s,.-]{5,200})/i);
    if (m2) legal = m2[1].trim();
    console.log('[10] Strategy 3 (lot/block pattern):', legal ? legal.substring(0, 80) : 'null');
  }

  const result = { address, legal, url: page.url() };
  fs.writeFileSync('/tmp/realist_result.json', JSON.stringify(result, null, 2));
  console.log('[RESULT]', JSON.stringify(result));
  return result;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
  const browser = await chromium.launch({ headless: DEVICE.headless, args: DEVICE.args });

  const context = await browser.newContext({
    userAgent: DEVICE.userAgent,
    viewport: DEVICE.viewport,
    timezoneId: DEVICE.timezoneId,
    locale: DEVICE.locale,
  });

  let page = await context.newPage();

  // Hide webdriver flag
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    // ── Try loading saved cookies first ──────────────────────────────────────
    const hasSavedCookies = await loadCookies(context);
    let isLoggedIn = false;

    if (hasSavedCookies) {
      console.log('[1] Testing saved session...');
      await page.goto('https://heartland.clareity.net/layouts', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      const url = page.url();
      console.log('[1] Session test URL:', url);
      isLoggedIn = !url.includes('login') && !url.includes('clareityiam.net/idp');
      if (isLoggedIn) console.log('[1] ✅ Session valid — skipping login');
      else console.log('[1] Session expired — need to re-login');
    }

    if (!isLoggedIn) {
      console.log('[1] Navigating to Clareity login...');
      await page.goto('https://heartland.clareityiam.net/idp/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: '/tmp/s1_login.png' });

      console.log('[2] Filling credentials...');
      const usernameInput = await page.waitForSelector('input[placeholder="Username"], input[name="username"], input[type="text"]:not([type="password"])', { timeout: 10000 });
      await usernameInput.fill('360602553');

      const passwordInput = await page.waitForSelector('input[type="password"]', { timeout: 10000 });
      await passwordInput.fill('Chicago60459.312');
      await page.waitForTimeout(500);

      console.log('[3] Clicking Password Login...');
      await page.click('button:has-text("Password Login")', { timeout: 10000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/s3_after_login.png' });

      const postLoginContent = await page.content();
      const postLoginUrl = page.url();
      const needsMFA = postLoginContent.toLowerCase().includes('verification') ||
                       postLoginContent.toLowerCase().includes('one-time') ||
                       postLoginContent.toLowerCase().includes('sms') ||
                       postLoginUrl.includes('mfa') || postLoginUrl.includes('verify') ||
                       postLoginUrl.includes('challenge');

      if (needsMFA) {
        console.log('[4] MFA required...');
        for (const txt of ['Send Code', 'Send via Text', 'Text me', 'SMS', 'Send SMS']) {
          try { await page.click(`text=${txt}`, { timeout: 2000 }); break; } catch {}
        }
        await page.screenshot({ path: '/tmp/s4_mfa.png' });

        const mfaCode = await waitForMFA();
        console.log('[4] Got MFA code:', mfaCode);

        const otpInput = await page.waitForSelector(
          'input[autocomplete="one-time-code"], input[inputmode="numeric"], input[name*="code" i], input[placeholder*="code" i], input[type="text"]',
          { timeout: 10000 }
        );
        await otpInput.fill(mfaCode);

        // Check "Remember device for 30 days"
        try {
          const checkboxes = await page.$$('input[type="checkbox"]');
          for (const cb of checkboxes) {
            const label = await cb.evaluate(el => {
              const lbl = el.closest('label') || document.querySelector(`label[for="${el.id}"]`);
              return lbl ? lbl.textContent.toLowerCase() : '';
            });
            if (label.includes('remember') || label.includes('device') || label.includes('trust') || label.includes('30')) {
              const isChecked = await cb.isChecked();
              if (!isChecked) await cb.check();
              console.log('[4] ✅ Checked remember device');
              break;
            }
          }
        } catch {}

        await page.click('button[type="submit"], button:has-text("Verify"), button:has-text("Submit"), button:has-text("Continue")', { timeout: 10000 });
        await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: '/tmp/s5_after_mfa.png' });
        console.log('[4] After MFA URL:', page.url());
      }

      await saveCookies(context);
    }

    // ── Navigate to Clareity dashboard and click Realist ────────────────────
    console.log('[6] Finding Realist app on Clareity dashboard...');
    await page.screenshot({ path: '/tmp/s6_dashboard.png' });

    // Expand app list if needed
    try {
      const showMore = await page.$('text=/show more/i, button:has-text("more"), a:has-text("more")');
      if (showMore) { await showMore.click(); await page.waitForTimeout(1500); }
    } catch {}

    const realistLink = await page.$('a:has-text("Realist"), [title*="Realist" i], [aria-label*="Realist" i], img[alt*="Realist" i]');
    if (realistLink) {
      console.log('[6] Clicking Realist — catching new tab...');
      const [newPage] = await Promise.all([
        context.waitForEvent('page', { timeout: 30000 }),
        realistLink.click()
      ]);
      await newPage.waitForLoadState('domcontentloaded', { timeout: 60000 });
      await newPage.waitForTimeout(4000);
      page = newPage;
      console.log('[6] New tab URL:', page.url());
    } else {
      throw new Error('Could not find Realist app link on Clareity dashboard');
    }

    await page.screenshot({ path: '/tmp/s6_realist.png' });
    console.log('[6] Realist page title:', await page.title());

    if (!page.url().includes('prd.realist.com')) {
      throw new Error('SSO failed — not on prd.realist.com: ' + page.url());
    }

    // ── Run the scrape ────────────────────────────────────────────────────────
    await scrapeRealist(page, ADDRESS, context);

  } catch (err) {
    console.error('[ERROR]', err.message);
    try { await page.screenshot({ path: '/tmp/error_screen.png' }); } catch {}
    fs.writeFileSync('/tmp/realist_error.txt', err.stack || err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
