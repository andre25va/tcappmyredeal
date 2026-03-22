// translate-text Edge Function
// Accepts an array of text strings, returns Spanish translations via OpenAI
// Used by email compose "Preview in Spanish" button
// Also called internally to translate inbound Spanish replies to English

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
    const { texts, targetLang = 'es', sourceLang = 'en' } = await req.json();

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'texts array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured. Add OPENAI_API_KEY to Supabase Edge Function secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const targetLangName = targetLang === 'es' ? 'Spanish' : targetLang === 'en' ? 'English' : targetLang;
    const sourceLangName = sourceLang === 'en' ? 'English' : sourceLang === 'es' ? 'Spanish' : sourceLang;

    const prompt = `Translate the following ${sourceLangName} texts to ${targetLangName}.

Rules:
- Keep professional real estate terminology natural and accurate
- Preserve all formatting, line breaks, and paragraph spacing
- Do NOT translate placeholder variables like {{address}}, {{closingDate}}, {{clientName}} — keep them exactly as-is
- Keep email signatures and formal closings appropriate for the target language
- Return ONLY a valid JSON array of translated strings, with no extra text or markdown

Texts to translate:
${JSON.stringify(texts)}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional real estate translator. Return only valid JSON arrays of translated strings, with no extra text, explanation, or markdown formatting.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 2000,
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

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim() || '';

    let translations: string[];
    try {
      translations = JSON.parse(rawContent);
      if (!Array.isArray(translations)) throw new Error('Not an array');
    } catch {
      // Fallback: try to extract JSON array from response
      const match = rawContent.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          translations = JSON.parse(match[0]);
        } catch {
          translations = texts; // Return originals if parsing fails
        }
      } else {
        translations = texts;
      }
    }

    // Ensure we have the same count as input
    while (translations.length < texts.length) {
      translations.push(texts[translations.length]);
    }

    return new Response(
      JSON.stringify({ translations, targetLang, sourceLang }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('translate-text error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
