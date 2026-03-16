import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method, query } = req;

  try {
    if (method === 'GET') {
      const { conversation_id, deal_id } = query as Record<string, string>;

      if (conversation_id) {
        // Get messages for a specific conversation
        const { data: messages, error } = await supabase
          .from('messages')
          .select('*, contacts(first_name, last_name, phone, role)')
          .eq('conversation_id', conversation_id)
          .order('sent_at', { ascending: true });
        if (error) throw error;

        // Mark as read
        await supabase
          .from('conversations')
          .update({ unread_count: 0 })
          .eq('id', conversation_id);

        return res.json({ messages });
      }

      // List all conversations (with optional deal filter)
      let q = supabase
        .from('conversations')
        .select('*, deals(property_address, city, state, pipeline_stage)')
        .order('last_message_at', { ascending: false });

      if (deal_id) q = q.eq('deal_id', deal_id);

      const { data: conversations, error } = await q;
      if (error) throw error;

      return res.json({ conversations });
    }

    if (method === 'DELETE') {
      const { conversation_id } = req.body as { conversation_id: string };
      if (!conversation_id) return res.status(400).json({ error: 'conversation_id required' });

      await supabase.from('messages').delete().eq('conversation_id', conversation_id);
      await supabase.from('conversations').delete().eq('id', conversation_id);
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Conversations error:', err);
    return res.status(500).json({ error: err.message });
  }
}
