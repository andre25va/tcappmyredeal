// fetch-mls-number Edge Function
// Uses OpenAI web search to find rich MLS property data for a given property address
// Only considers Active, Pending, Under Contract, or Contingent listings
// Supports single and split (duplex) addresses

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
    const { address, city, state, zipCode, secondaryAddress } = await req.json();

    if (!address || !city) {
      return new Response(
        JSON.stringify({ error: 'Address and city are required' }),
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

    const cityStateZip = [city, state, zipCode].filter(Boolean).join(', ');

    // Build the full address string — handle split duplex addresses
    let fullAddress: string;
    if (secondaryAddress && secondaryAddress.trim()) {
      fullAddress = `"${address}" AND "${secondaryAddress.trim()}" in ${cityStateZip} (duplex — two units of the same property)`;
    } else {
      fullAddress = `${address}, ${cityStateZip}`;
    }

    const searchQuery = `Search Zillow, Realtor.com, Redfin, or MLS listing sites for the property: "${fullAddress}".
IMPORTANT: Only include results where the listing status is Active, Pending, Under Contract, or Contingent. Do NOT include sold or closed listings.
Return ONLY a valid JSON object (no markdown, no explanation) with these exact fields (use null if unknown): mlsNumber, mlsBoardName, propertyType, listPrice, bedrooms, bathrooms, sqftLiving, yearBuilt, listingStatus, daysOnMarket, listingAgentName, listingOfficeName, subdivision, hoaFee, garage, pool.
mlsBoardName: the name of the MLS board or association this listing belongs to (e.g., "Heartland MLS", "KCRAR", "CAR MLS"). Return null if unknown.
propertyType must be one of: Single Family, Condo, Townhouse, Multi-Family, Land, Commercial, Other.
listingStatus must be one of: Active, Pending, Under Contract, Contingent.
pool must be a boolean (true or false).
If the property cannot be found with one of those active statuses, return exactly: {"found":false}
If found, return: {"found":true,"data":{...all fields...}}`;

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

    // Extract text from Responses API output format
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

    // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
    let jsonText = outputText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Try to parse the JSON
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

    // Return the rich property data
    return new Response(
      JSON.stringify({ found: true, data: parsed.data || {} }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('fetch-mls-number error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
