// fetch-attachment Edge Function
// Downloads a Gmail attachment, stores in Supabase Storage, returns public URL
// Called by frontend when user wants to preview an email attachment

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS ──────────────────────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

// ── Gmail helpers ─────────────────────────────────────────────────────────────
async function getGmailAccessToken(): Promise<string> {
  const clientId = Deno.env.get('GMAIL_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET')!;
  const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN')!;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to refresh Gmail token: ${err}`);
  }

  const data = await res.json();
  return data.access_token;
}

// Recursively find first attachment part in a Gmail message payload
function findAttachmentPart(payload: any): { attachmentId: string; filename: string; mimeType: string } | null {
  if (!payload) return null;

  // Current part is an attachment with a body attachment ID
  if (payload.body?.attachmentId && payload.filename && payload.filename !== '') {
    return {
      attachmentId: payload.body.attachmentId,
      filename: payload.filename,
      mimeType: payload.mimeType || 'application/octet-stream',
    };
  }

  // Recurse into sub-parts
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = findAttachmentPart(part);
      if (found) return found;
    }
  }

  return null;
}

// ── Main Handler ──────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth check - require valid bearer token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Unauthorized', 401);
    }

    const { documentId } = await req.json();
    if (!documentId) return errorResponse('Missing documentId', 400);

    // Supabase client (service role for storage writes)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch document record
    const { data: doc, error: docError } = await supabase
      .from('request_documents')
      .select('id, file_name, file_url, storage_path, gmail_message_id, gmail_attachment_id')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      return errorResponse('Document not found', 404);
    }

    // Already stored in Supabase - just return the URL
    if (doc.file_url) {
      return jsonResponse({ url: doc.file_url, filename: doc.file_name });
    }

    if (!doc.gmail_message_id) {
      return errorResponse('No Gmail message ID for this document', 400);
    }

    // Get Gmail access token
    const accessToken = await getGmailAccessToken();

    let attachmentId: string = doc.gmail_attachment_id;
    let filename: string = doc.file_name || 'document';
    let mimeType = 'application/octet-stream';

    // If no attachment ID stored yet, fetch the Gmail message to find it
    if (!attachmentId) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${doc.gmail_message_id}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!msgRes.ok) {
        const err = await msgRes.text();
        return errorResponse(`Gmail message fetch failed (${msgRes.status}): ${err}`, 502);
      }

      const msgData = await msgRes.json();
      const attachment = findAttachmentPart(msgData.payload);

      if (!attachment) {
        return errorResponse('No attachment found in this Gmail message', 404);
      }

      attachmentId = attachment.attachmentId;
      filename = attachment.filename || filename;
      mimeType = attachment.mimeType;
    }

    // Download attachment bytes from Gmail
    const attachRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${doc.gmail_message_id}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!attachRes.ok) {
      const err = await attachRes.text();
      return errorResponse(`Gmail attachment download failed (${attachRes.status}): ${err}`, 502);
    }

    const attachData = await attachRes.json();

    // Decode base64url → bytes
    const base64 = (attachData.data as string).replace(/-/g, '+').replace(/_/g, '/');
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Determine content type from filename if mimeType is generic
    if (mimeType === 'application/octet-stream') {
      const ext = filename.split('.').pop()?.toLowerCase();
      if (ext === 'pdf') mimeType = 'application/pdf';
      else if (ext === 'png') mimeType = 'image/png';
      else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
    }

    // Upload to Supabase Storage (request-attachments bucket)
    const storagePath = `${doc.id}/${filename}`;
    const { error: uploadError } = await supabase.storage
      .from('request-attachments')
      .upload(storagePath, bytes, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      return errorResponse(`Storage upload failed: ${uploadError.message}`, 500);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('request-attachments')
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // Update document record with URL, path, and attachment ID for future use
    await supabase
      .from('request_documents')
      .update({
        file_url: publicUrl,
        storage_path: storagePath,
        gmail_attachment_id: attachmentId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', doc.id);

    return jsonResponse({ url: publicUrl, filename });

  } catch (error) {
    console.error('fetch-attachment error:', error);
    return errorResponse(error.message);
  }
});
