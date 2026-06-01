// fetch-mls-number Edge Function v16
// Changes from v15:
//   - County made REQUIRED in all OpenAI prompts (emphasized, example provided)
//   - After any OpenAI fallback path, if legalDescription is null but we have address+county, fire fetchLegalFromOpenAI
//   - buildAddressQuery + buildMlsQuery updated for stricter county/legal extraction
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VPS_URL = 'https://mls.srv1462857.hstgr.cloud';

// ─── Realist property lookup ──────────────────────────────────────────────────
async function fetchFromRealist(address: string, city?: string, state?: string, zipCode?: string): Promise<any | null> {
  try {
    const parts = [address, city, state, zipCode].filter(Boolean);
    const fullAddress = parts.join(' ');
    const res = await fetch(`${VPS_URL}/property?address=${encodeURIComponent(fullAddress)}`, {
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) { console.warn(`Realist VPS returned ${res.status}`); return null; }
    const data = await res.json();
    if (data.error) { console.warn('Realist error:', data.error); return null; }
    return data;
  } catch (err) {
    console.warn('Realist VPS fetch failed:', err);
    return null;
  }
}

// ─── VPS: resolve MLS# → address via gpt-4o-search-preview ──────────────────
async function fetchAddressFromMlsViaVPS(
  mlsNumber: string, openAiKey: string
): Promise<{ address: string; city: string; state: string; zip: string } | null> {
  try {
    console.log(`[v16] Calling VPS /resolve-mls for MLS# ${mlsNumber}...`);
    const res = await fetch(`${VPS_URL}/resolve-mls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mlsNumber, apiKey: openAiKey }),
      signal: AbortSignal.timeout(70000),
    });
    if (!res.ok) { console.warn(`VPS /resolve-mls returned ${res.status}`); return null; }
    const data = await res.json();
    console.log(`[v16] VPS resolve-mls result: found=${data.found}, address=${data.address}`);
    if (data.found && data.address) {
      return { address: data.address, city: data.city, state: data.state, zip: data.zip };
    }
    return null;
  } catch (err) {
    console.warn('VPS /resolve-mls failed:', err);
    return null;
  }
}

// ─── OpenAI: legal description enrichment ────────────────────────────────────
async function fetchLegalFromOpenAI(
  address: string, city: string, state: string, zip: string, county: string, openAiKey: string
): Promise<string | null> {
  try {
    const prompt = `What is the full legal description for the property at ${address}, ${city}, ${state} ${zip} (${county} County)?
Return ONLY the legal description text as it appears in county records or the deed — for example: "Lot 74, Holmes Creek Hills North 5th Plat, City of Kearney, Clay County, Missouri".
If you cannot find it, return exactly: null`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        tools: [{ type: 'web_search_preview' }],
        input: prompt,
      }),
      signal: AbortSignal.timeout(40000),
    });

    if (!response.ok) return null;
    const apiData = await response.json();
    const text = (apiData.output || [])
      .filter((i: any) => i.type === 'message')
      .flatMap((i: any) => i.content || [])
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text).join('').trim();

    if (!text || text.toLowerCase() === 'null') return null;
    return text;
  } catch (err) {
    console.warn('OpenAI legal desc failed:', err);
    return null;
  }
}

// ─── OpenAI: full property search ────────────────────────────────────────────
async function fetchFromOpenAI(searchQuery: string, openAiKey: string): Promise<any | null> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o', tools: [{ type: 'web_search_preview' }], input: searchQuery }),
    signal: AbortSignal.timeout(55000),
  });
  if (!response.ok) return null;
  const apiData = await response.json();
  const outputText = (apiData.output || [])
    .filter((item: any) => item.type === 'message')
    .flatMap((item: any) => item.content || [])
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text).join('').trim();
  if (!outputText) return null;
  const jsonText = outputText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const parsed = JSON.parse(jsonText);
    if (parsed?.data) parsed.data._source = 'openai_search';
    return parsed?.found !== false ? parsed : null;
  } catch { return null; }
}

// ─── Build Realist response object ───────────────────────────────────────────
function buildRealistResponse(realistData: any, mlsNumber: string | null, resolvedAddress: any, legalDescription: string | null) {
  return {
    found: true,
    data: {
      mlsNumber: mlsNumber || null,
      mlsBoardName: 'Heartland MLS',
      propertyType: 'Single Family',
      listPrice: null,
      bedrooms: realistData.bedrooms ? parseInt(realistData.bedrooms) : null,
      bathrooms: realistData.baths ? parseFloat(realistData.baths) : null,
      sqftLiving: realistData.lotSqft ? parseInt(realistData.lotSqft) : null,
      yearBuilt: realistData.yearBuilt ? parseInt(realistData.yearBuilt) : null,
      listingStatus: null,
      daysOnMarket: null,
      listingAgentName: null,
      listingOfficeName: null,
      subdivision: realistData.subdivision || null,
      hoaFee: null,
      garage: null,
      pool: false,
      address: [realistData.address, realistData.city, realistData.state, realistData.zip].filter(Boolean).join(', '),
      city: realistData.city || resolvedAddress?.city || null,
      state: realistData.state || resolvedAddress?.state || null,
      zipCode: realistData.zip || resolvedAddress?.zip || null,
      county: toTitleCase(realistData.county) || null,
      legalDescription: legalDescription,
      apn: realistData.apn || null,
      ownerName: realistData.owner || null,
      schoolDistrict: realistData.schoolDistrict || null,
      assessedValue: realistData.assessedValue || null,
      latitude: realistData.latitude || null,
      longitude: realistData.longitude || null,
      _source: mlsNumber && !resolvedAddress ? 'realist_vps' : 'mls_then_realist',
    }
  };
}

function toTitleCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ─── Enrich OpenAI result with legal description if missing ──────────────────
async function enrichWithLegal(result: any, openAiKey: string): Promise<any> {
  if (!result?.found || !result?.data) return result;
  if (result.data.legalDescription) return result; // already have it
  const { address, city, state, zipCode, county } = result.data;
  if (!address || !county) return result; // not enough info
  console.log(`[v16] legalDescription missing — running dedicated fetch for ${address}, ${county} County`);
  const legal = await fetchLegalFromOpenAI(address, city || '', state || '', zipCode || '', county, openAiKey);
  if (legal) result.data.legalDescription = legal;
  return result;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { address, city, state, zipCode, secondaryAddress, mlsNumber } = await req.json();
    const openAiKey = Deno.env.get('OPENAI_API_KEY');

    if (!mlsNumber && !address) {
      return new Response(
        JSON.stringify({ error: 'Provide either address or mlsNumber' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── ADDRESS provided → Realist first ──────────────────────────────────
    if (address && address.trim()) {
      const realistData = await fetchFromRealist(address.trim(), city, state, zipCode);

      if (realistData) {
        let legalDescription = realistData.legal || null;
        if (!legalDescription && openAiKey && realistData.zip && realistData.county) {
          legalDescription = await fetchLegalFromOpenAI(
            realistData.address || address,
            realistData.city || city,
            realistData.state || state,
            realistData.zip,
            realistData.county,
            openAiKey
          );
        }
        return new Response(
          JSON.stringify(buildRealistResponse(realistData, mlsNumber || null, null, legalDescription)),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Realist failed — fall through to OpenAI
      console.warn('Realist returned no data, falling back to OpenAI');
      if (!openAiKey) return new Response(JSON.stringify({ found: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const cityStateZip = [city, state, zipCode].filter(Boolean).join(', ');
      const fullAddress = secondaryAddress?.trim()
        ? `"${address}" AND "${secondaryAddress.trim()}" in ${cityStateZip}`
        : `${address}, ${cityStateZip}`;
      let openAiResult = await fetchFromOpenAI(buildAddressQuery(fullAddress), openAiKey);
      // v16: enrich with dedicated legal description call if missing
      if (openAiResult && openAiKey) openAiResult = await enrichWithLegal(openAiResult, openAiKey);
      return new Response(
        JSON.stringify(openAiResult || { found: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── MLS# only → VPS resolve-mls → Realist ─────────────────────────────
    if (!openAiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const stateLabel = state === 'KS' ? 'Kansas' : state === 'MO' ? 'Missouri' : (state || 'Kansas City area');

    // Step 1: Ask VPS to resolve MLS# → address (uses gpt-4o-search-preview)
    const resolvedAddress = await fetchAddressFromMlsViaVPS(mlsNumber.trim(), openAiKey);

    if (resolvedAddress?.address) {
      console.log(`[v16] Resolved: ${JSON.stringify(resolvedAddress)} — hitting Realist...`);

      // Step 2: Feed that address to Realist
      const realistData = await fetchFromRealist(
        resolvedAddress.address,
        resolvedAddress.city,
        resolvedAddress.state,
        resolvedAddress.zip
      );

      if (realistData) {
        // Step 3: Legal description enrichment
        let legalDescription = realistData.legal || null;
        if (!legalDescription && realistData.zip && realistData.county) {
          legalDescription = await fetchLegalFromOpenAI(
            realistData.address || resolvedAddress.address,
            realistData.city || resolvedAddress.city,
            realistData.state || resolvedAddress.state,
            realistData.zip,
            realistData.county,
            openAiKey
          );
        }
        return new Response(
          JSON.stringify(buildRealistResponse(realistData, mlsNumber, resolvedAddress, legalDescription)),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.warn('[v16] Realist failed after address resolution, falling back to full OpenAI search...');
    } else {
      console.warn('[v16] VPS address resolution failed, falling back to full OpenAI search...');
    }

    // Final fallback: full OpenAI web search for the MLS#
    let openAiResult = await fetchFromOpenAI(buildMlsQuery(mlsNumber.trim(), stateLabel), openAiKey);
    // v16: enrich with dedicated legal description call if missing
    if (openAiResult && openAiKey) openAiResult = await enrichWithLegal(openAiResult, openAiKey);
    return new Response(
      JSON.stringify(openAiResult || { found: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

function buildAddressQuery(fullAddress: string): string {
  return `Search Zillow, Realtor.com, Redfin, or MLS listing sites for the property: "${fullAddress}".
Return ONLY a valid JSON object (no markdown, no extra text) with EXACTLY these fields (use null if not found):
mlsNumber, mlsBoardName, propertyType, listPrice, bedrooms, bathrooms, sqftLiving, yearBuilt, listingStatus, daysOnMarket, listingAgentName, listingOfficeName, subdivision, hoaFee, garage, pool, address, city, zipCode, county, legalDescription.

IMPORTANT:
- county: the county name (e.g. "Johnson", "Jackson", "Clay", "Platte") — this is REQUIRED, always include it
- legalDescription: the full legal description from county records (e.g. "Lot 14 Block 3 Timber Ridge Subdivision") — include if found
- propertyType: one of Single Family, Condo, Townhouse, Multi-Family, Land, Commercial, Other
- pool: boolean

If property not found return {"found":false}
If found return {"found":true,"data":{...all fields above...}}`;
}

function buildMlsQuery(mlsNumber: string, stateLabel: string): string {
  return `Search Zillow, Realtor.com, Redfin, Heartland MLS for MLS listing number: ${mlsNumber} in ${stateLabel}.
Return ONLY a valid JSON object (no markdown, no extra text) with EXACTLY these fields (use null if not found):
mlsNumber, mlsBoardName, propertyType, listPrice, bedrooms, bathrooms, sqftLiving, yearBuilt, listingStatus, daysOnMarket, listingAgentName, listingOfficeName, subdivision, hoaFee, garage, pool, address, city, zipCode, county, legalDescription.

IMPORTANT:
- county: the county name (e.g. "Johnson", "Jackson", "Clay", "Platte") — this is REQUIRED, always include it
- legalDescription: the full legal description from county records or deed (e.g. "Lot 23 Stoneview 1st Plat City of Lenexa Johnson County Kansas") — include if found
- propertyType: one of Single Family, Condo, Townhouse, Multi-Family, Land, Commercial, Other
- pool: boolean

If not found return {"found":false}
If found return {"found":true,"data":{...all fields above...}}`;
}
