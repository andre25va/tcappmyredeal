// fetch-mls-number Edge Function v12
// Architecture:
//   address provided → Realist VPS (zip, county, apn, owner) + OpenAI (legal desc)
//   mlsNumber only   → OpenAI (address resolution only) → Realist VPS + OpenAI (legal desc)
//                      fallback: OpenAI full web search if address resolution or Realist fails
//   both provided    → Realist + OpenAI combined
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
    if (!res.ok) {
      console.warn(`Realist VPS returned ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (data.error) { console.warn('Realist error:', data.error); return null; }
    return data;
  } catch (err) {
    console.warn('Realist VPS fetch failed:', err);
    return null;
  }
}

// ─── OpenAI: resolve MLS# → address only ─────────────────────────────────────
async function fetchAddressFromMls(
  mlsNumber: string, stateLabel: string, openAiKey: string
): Promise<{ address: string; city: string; state: string; zip: string } | null> {
  try {
    const prompt = `Find the street address for MLS listing number ${mlsNumber} in ${stateLabel} (Heartland MLS / Kansas City area).
Return ONLY a valid JSON object with no markdown:
{"address": "123 Main St", "city": "Kansas City", "state": "MO", "zip": "64112"}
If not found, return exactly: null`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        tools: [{ type: 'web_search_preview' }],
        input: prompt,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) return null;
    const apiData = await response.json();
    const text = (apiData.output || [])
      .filter((i: any) => i.type === 'message')
      .flatMap((i: any) => i.content || [])
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text).join('').trim();

    if (!text || text.toLowerCase() === 'null') return null;
    const jsonText = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(jsonText);
    if (parsed?.address) return parsed;
    return null;
  } catch (err) {
    console.warn('OpenAI address resolution failed:', err);
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
      signal: AbortSignal.timeout(20000),
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

// ─── OpenAI: full property search (final fallback) ───────────────────────────
async function fetchFromOpenAI(searchQuery: string, openAiKey: string): Promise<any | null> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o', tools: [{ type: 'web_search_preview' }], input: searchQuery }),
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
      const openAiResult = await fetchFromOpenAI(buildAddressQuery(fullAddress), openAiKey);
      return new Response(
        JSON.stringify(openAiResult || { found: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── MLS# only → resolve address → Realist ─────────────────────────────
    if (!openAiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const stateLabel = state === 'KS' ? 'Kansas' : state === 'MO' ? 'Missouri' : (state || 'Kansas City area');

    // Step 1: Ask OpenAI for the address from the MLS#
    console.log(`Resolving address for MLS# ${mlsNumber}...`);
    const resolvedAddress = await fetchAddressFromMls(mlsNumber.trim(), stateLabel, openAiKey);

    if (resolvedAddress?.address) {
      console.log(`Resolved address: ${JSON.stringify(resolvedAddress)} — hitting Realist...`);

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
      console.warn('Realist failed after address resolution, falling back to full OpenAI search...');
    } else {
      console.warn('Address resolution failed, falling back to full OpenAI search...');
    }

    // Final fallback: full OpenAI web search for the MLS#
    const openAiResult = await fetchFromOpenAI(buildMlsQuery(mlsNumber.trim(), stateLabel), openAiKey);
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
Return ONLY a valid JSON object (no markdown) with these fields (null if unknown): mlsNumber, mlsBoardName, propertyType, listPrice, bedrooms, bathrooms, sqftLiving, yearBuilt, listingStatus, daysOnMarket, listingAgentName, listingOfficeName, subdivision, hoaFee, garage, pool, address, city, zipCode, county, legalDescription.
propertyType: one of Single Family, Condo, Townhouse, Multi-Family, Land, Commercial, Other. pool: boolean.
If not found return {"found":false}, if found return {"found":true,"data":{...}}`;
}

function buildMlsQuery(mlsNumber: string, stateLabel: string): string {
  return `Search Zillow, Realtor.com, Redfin, Heartland MLS for MLS listing number: ${mlsNumber} in ${stateLabel}.
Return ONLY a valid JSON object (no markdown) with these fields (null if unknown): mlsNumber, mlsBoardName, propertyType, listPrice, bedrooms, bathrooms, sqftLiving, yearBuilt, listingStatus, daysOnMarket, listingAgentName, listingOfficeName, subdivision, hoaFee, garage, pool, address, city, zipCode, county, legalDescription.
county: county name (e.g. "Jackson"). legalDescription: full legal desc from deed/records. propertyType: one of Single Family, Condo, Townhouse, Multi-Family, Land, Commercial, Other. pool: boolean.
If not found return {"found":false}, if found return {"found":true,"data":{...}}`;
}
