import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Log the request body for debugging
    const bodyText = await req.text();
    if (!bodyText) {
      throw new Error('Request body is empty');
    }
    
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch (e) {
      throw new Error(`Invalid JSON in request body: ${bodyText}`);
    }
    
    const { dealId } = body;
    if (!dealId) {
      throw new Error('dealId is required');
    }

    // Fetch deal data for analysis
    const { data: deal, error: dealError } = await supabaseClient
      .from('deals')
      .select('*, tasks(*), documents(*)')
      .eq('id', dealId)
      .single()

    if (dealError) throw dealError

    // Construct analysis prompt
    const overdueTasks = deal.tasks?.filter((t: any) => !t.completedAt && t.dueDate && new Date(t.dueDate) < new Date()) || []
    const pendingDocs = deal.documents?.filter((d: any) => d.status === 'pending_request') || []
    
    const prompt = `Analyze this real estate deal and provide a 1-2 sentence status summary.
    Property: ${deal.propertyAddress}
    Overdue Tasks: ${overdueTasks.length}
    Pending Docs: ${pendingDocs.length}
    Closing Date: ${deal.closingDate}
    
    Be concise and professional. Focus on what needs to be done next.`

    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      }),
    })

    if (!openAiResponse.ok) {
      const errorData = await openAiResponse.text();
      throw new Error(`OpenAI API error: ${errorData}`);
    }

    const aiData = await openAiResponse.json()
    const insight = aiData.choices[0].message.content

    return new Response(
      JSON.stringify({ insight }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in get-ai-insights:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
