// fetch-mls-number Edge Function v9
// NEW: No MLS# = not on MLS = skip immediately (return all nulls)
// NEW: MLS# provided = try Railway listing fetcher FIRST, fallback to OpenAI
// Supports: (1) address+city search via OpenAI, (2) mlsNumber-only → Railway then OpenAI
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Railway MLS Listing Fetcher
// ---------------------------------------------------------------------------
const RAILWAY_LISTING_URL = 'https://mls-listing-fetcher-production.up.railway.app';

async function fetchFromRailway(mlsNumber: string): Promise<any | null> {
  try {
    const response = await fetch(`${RAILWAY_LISTING_URL}/listing/${encodeURIComponent(mlsNumber)}`, {
      signal: AbortSignal.timeout(25000),
    });

    if (response.status === 401) {
      // Session expired — log and fall through to OpenAI
      console.warn('Railway MLS session expired, falling back to OpenAI');
      return null;
    }

    if (!response.ok) {
      console.warn(`Railway returned ${response.status}, falling back to OpenAI`);
      return null;
    }

    const data = await response.json();
    if (!data.found) return null;

    // Map Railway response to our standard format
    const d = data.data;
    return {
      found: true,
      data: {
        mlsNumber: d.mlsNumber || mlsNumber,
        mlsBoardName: 'Heartland MLS',
        propertyType: mapPropertyType(d.propertyType),
        listPrice: d.listPrice ? parseFloat(d.listPrice) : null,
        bedrooms: d.bedrooms ? parseInt(d.bedrooms) : null,
        bathrooms: d.bathsFull ? parseInt(d.bathsFull) : null,
        sqftLiving: d.sqftAboveGrade ? parseInt(d.sqftAboveGrade.replace(/[^0-9]/g, '')) : null,
        yearBuilt: d.yearBuilt ? parseInt(d.yearBuilt) : null,
        listingStatus: mapStatus(d.status),
        daysOnMarket: null,
        listingAgentName: null,
        listingOfficeName: null,
        subdivision: d.subdivision || null,
        hoaFee: null,
        garage: d.garage || null,
        pool: false,
        address: d.address || null,
        city: d.city || null,
        state: d.state || null,
        zipCode: d.zipCode || null,
        county: d.county || null,
        legalDescription: d.legalDescription || null,
        _source: 'railway_mls',
      },
    };
  } catch (err) {
    console.warn('Railway fetch failed:', err);
    return null;
  }
}

function mapPropertyType(raw: string | null): string {
  if (!raw) return 'Single Family';
  const r = raw.toUpperCase();
  if (r.includes('SINGLE') || r === 'SF') return 'Single Family';
  if (r.includes('CONDO')) return 'Condo';
  if (r.includes('TOWN')) return 'Townhouse';
  if (r.includes('MULTI') || r.includes('DUPLEX')) return 'Multi-Family';
  if (r.includes('LAND') || r.includes('LOT')) return 'Land';
  if (r.includes('COMM')) return 'Commercial';
  return 'Single Family';
}

function mapStatus(raw: string | null): string {
  if (!raw) return 'Active';
  const r = raw.toUpperCase();
  if (r.includes('ACT') || r.includes('ACTIVE')) return 'Active';
  if (r.includes('PEND') || r.includes('PENDING')) return 'Pending';
  if (r.includes('UNDER') || r.includes('CONTRACT')) return 'Under Contract';
  if (r.includes('CONTING')) return 'Contingent';
  if (r.includes('SOLD') || r.includes('CLOS')) return 'Closed';
  return 'Active';
}

// ---------------------------------------------------------------------------
// OpenAI fallback
// ---------------------------------------------------------------------------
async function fetchFromOpenAI(searchQuery: string, openAiKey: string): Promise<any | null> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      tools: [{ type: 'web_search_preview' }],
      input: searchQuery,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('OpenAI API error:', errText);
    return null;
  }

  const apiData = await response.json();

  const outputText = (apiData.output || [])
    .filter((item: any) => item.type === 'message')
    .flatMap((item: any) => item.content || [])
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text)
    .join('')
    .trim();

  if (!outputText) return null;

  let jsonText = outputText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(jsonText);
    if (parsed && parsed.found !== false) {
      if (parsed.data) parsed.data._source = 'openai_search';
      return parsed;
    }
    return null;
  } catch {
    console.error('JSON parse failed for OpenAI output:', outputText);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { address, city, state, zipCode, secondaryAddress, mlsNumber } = await req.json();

    // -------------------------------------------------------------------------
    // RULE: No MLS# AND no address = nothing to look up
    // -------------------------------------------------------------------------
    if (!mlsNumber && (!address || !city)) {
      return new Response(
        JSON.stringify({ error: 'Provide either (address + city) or mlsNumber' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // -------------------------------------------------------------------------
    // RULE: MLS# provided → try Railway first (direct from Heartland MLS),
    //       then fall back to OpenAI web search
    // -------------------------------------------------------------------------
    if (mlsNumber && mlsNumber.trim()) {
      // 1. Try Railway (fast, accurate, direct from source)
      const railwayResult = await fetchFromRailway(mlsNumber.trim());
      if (railwayResult) {
        return new Response(
          JSON.stringify(railwayResult),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 2. Fall back to OpenAI web search
      const openAiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openAiKey) {
        return new Response(
          JSON.stringify({ error: 'OpenAI API key not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const stateLabel = state === 'KS' ? 'Kansas' : state === 'MO' ? 'Missouri' : (state || 'Kansas City area');
      const searchQuery = `Search Zillow, Realtor.com, Redfin, Heartland MLS, or any MLS listing site for the property with MLS listing number: ${mlsNumber.trim()}${stateLabel ? ` in ${stateLabel}` : ''}.
Return ONLY a valid JSON object (no markdown, no explanation) with these exact fields (use null if unknown): mlsNumber, mlsBoardName, propertyType, listPrice, bedrooms, bathrooms, sqftLiving, yearBuilt, listingStatus, daysOnMarket, listingAgentName, listingOfficeName, subdivision, hoaFee, garage, pool, address, city, zipCode, county, legalDescription.
county: the county name where the property is located (e.g., "Jackson", "Johnson"). Return null if unknown.
legalDescription: the full legal description of the property as it appears in county records or the deed (e.g., "Lot 14, Block 3, Timber Ridge Subdivision, City of Kansas City, Jackson County, Missouri"). Return null if not found.
mlsBoardName: the name of the MLS board or association this listing belongs to (e.g., "Heartland MLS", "KCRAR", "CAR MLS"). Return null if unknown.
propertyType must be one of: Single Family, Condo, Townhouse, Multi-Family, Land, Commercial, Other.
listingStatus must be one of: Active, Pending, Under Contract, Contingent, Sold, Closed.
pool must be a boolean (true or false).
If the listing cannot be found, return exactly: {"found":false}
If found, return: {"found":true,"data":{...all fields...}}`;

      const openAiResult = await fetchFromOpenAI(searchQuery, openAiKey);
      if (openAiResult) {
        return new Response(
          JSON.stringify(openAiResult),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // -------------------------------------------------------------------------
    // Address-based search (no MLS# provided) → OpenAI only
    // -------------------------------------------------------------------------
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cityStateZip = [city, state, zipCode].filter(Boolean).join(', ');
    let fullAddress: string;
    if (secondaryAddress && secondaryAddress.trim()) {
      fullAddress = `"${address}" AND "${secondaryAddress.trim()}" in ${cityStateZip} (duplex — two units of the same property)`;
    } else {
      fullAddress = `${address}, ${cityStateZip}`;
    }

    const searchQuery = `Search Zillow, Realtor.com, Redfin, or MLS listing sites for the property: "${fullAddress}".
Return ONLY a valid JSON object (no markdown, no explanation) with these exact fields (use null if unknown): mlsNumber, mlsBoardName, propertyType, listPrice, bedrooms, bathrooms, sqftLiving, yearBuilt, listingStatus, daysOnMarket, listingAgentName, listingOfficeName, subdivision, hoaFee, garage, pool, address, city, zipCode, county, legalDescription.
county: the county name where the property is located (e.g., "Jackson", "Johnson"). Return null if unknown.
legalDescription: the full legal description of the property as it appears in county records or the deed (e.g., "Lot 14, Block 3, Timber Ridge Subdivision, City of Kansas City, Jackson County, Missouri"). Return null if not found.
mlsBoardName: the name of the MLS board or association this listing belongs to (e.g., "Heartland MLS", "KCRAR", "CAR MLS"). Return null if unknown.
propertyType must be one of: Single Family, Condo, Townhouse, Multi-Family, Land, Commercial, Other.
listingStatus must be one of: Active, Pending, Under Contract, Contingent, Sold, Closed.
pool must be a boolean (true or false).
If the property cannot be found at all, return exactly: {"found":false}
If found, return: {"found":true,"data":{...all fields...}}`;

    const openAiResult = await fetchFromOpenAI(searchQuery, openAiKey);
    if (openAiResult) {
      return new Response(
        JSON.stringify(openAiResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ found: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
