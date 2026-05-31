// fetch-mls-number Edge Function v2
// Supports: (1) address+city search, (2) mlsNumber-only lookup
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { address, city, state, zipCode, secondaryAddress, mlsNumber } = await req.json();

    // Must have either (address + city) or mlsNumber
    if (!mlsNumber && (!address || !city)) {
      return new Response(
        JSON.stringify({ error: 'Provide either (address + city) or mlsNumber' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let searchQuery: string;

    if (mlsNumber && !address) {
      // MLS # only search
      const stateLabel = state === 'KS' ? 'Kansas' : state === 'MO' ? 'Missouri' : (state || 'Kansas City area');
      searchQuery = `Search Zillow, Realtor.com, Redfin, Heartland MLS, or any MLS listing site for the property with MLS listing number: ${mlsNumber}${stateLabel ? ` in ${stateLabel}` : ''}.
Return ONLY a valid JSON object (no markdown, no explanation) with these exact fields (use null if unknown): mlsNumber, mlsBoardName, propertyType, listPrice, bedrooms, bathrooms, sqftLiving, yearBuilt, listingStatus, daysOnMarket, listingAgentName, listingOfficeName, subdivision, hoaFee, garage, pool, address, city, zipCode, county, legalDescription.
county: the county name where the property is located (e.g., "Jackson County").
legalDescription: the full legal description of the property (e.g., "Lot 14, Block 3, Timber Ridge Subdivision"). Return null if unavailable.
mlsBoardName: the name of the MLS board or association this listing belongs to (e.g., "Heartland MLS", "KCRAR", "CAR MLS"). Return null if unknown.
propertyType must be one of: Single Family, Condo, Townhouse, Multi-Family, Land, Commercial, Other.
listingStatus must be one of: Active, Pending, Under Contract, Contingent, Sold, Closed.
pool must be a boolean (true or false).
If the listing cannot be found, return exactly: {"found":false}
If found, return: {"found":true,"data":{...all fields...}}`;
    } else {
      // Address-based search (original logic)
      const cityStateZip = [city, state, zipCode].filter(Boolean).join(', ');
      let fullAddress: string;
      if (secondaryAddress && secondaryAddress.trim()) {
        fullAddress = `"${address}" AND "${secondaryAddress.trim()}" in ${cityStateZip} (duplex — two units of the same property)`;
      } else {
        fullAddress = `${address}, ${cityStateZip}`;
      }
      searchQuery = `Search Zillow, Realtor.com, Redfin, or MLS listing sites for the property: "${fullAddress}".
Return ONLY a valid JSON object (no markdown, no explanation) with these exact fields (use null if unknown): mlsNumber, mlsBoardName, propertyType, listPrice, bedrooms, bathrooms, sqftLiving, yearBuilt, listingStatus, daysOnMarket, listingAgentName, listingOfficeName, subdivision, hoaFee, garage, pool, county, legalDescription.
county: the county name where the property is located (e.g., "Jackson County").
legalDescription: the full legal description of the property (e.g., "Lot 14, Block 3, Timber Ridge Subdivision"). Return null if unavailable.
mlsBoardName: the name of the MLS board or association this listing belongs to (e.g., "Heartland MLS", "KCRAR", "CAR MLS"). Return null if unknown.
propertyType must be one of: Single Family, Condo, Townhouse, Multi-Family, Land, Commercial, Other.
listingStatus must be one of: Active, Pending, Under Contract, Contingent, Sold, Closed.
pool must be a boolean (true or false).
If the property cannot be found at all, return exactly: {"found":false}
If found, return: {"found":true,"data":{...all fields...}}`;
    }

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
      return new Response(
        JSON.stringify({ error: `OpenAI API error: ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiData = await response.json();

    const outputText = (apiData.output || [])
      .filter((item: any) => item.type === 'message')
      .flatMap((item: any) => item.content || [])
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')
      .trim();

    if (!outputText) {
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let jsonText = outputText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      console.error('JSON parse failed for output:', outputText);
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!parsed || parsed.found === false) {
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(parsed),
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
