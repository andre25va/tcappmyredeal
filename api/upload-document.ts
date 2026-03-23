import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import Busboy from 'busboy';

// Allow up to 15 MB uploads, disable default body parser so we can stream multipart
export const config = {
  api: {
    bodyParser: false,
    maxDuration: 30,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { file, fields } = await parseMultipart(req);
    const { deal_id } = fields;

    if (!file || !deal_id) {
      return res.status(400).json({ error: 'file and deal_id are required' });
    }

    let processedBuffer: Buffer = file.buffer;
    const isPdf = file.mimetype === 'application/pdf' || (file.originalname || '').toLowerCase().endsWith('.pdf');

    // Flatten PDF form fields to reduce size and ensure clean text extraction
    if (isPdf) {
      try {
        const { PDFDocument } = await import('pdf-lib');
        const pdfDoc = await PDFDocument.load(processedBuffer, { ignoreEncryption: true });
        try {
          const form = pdfDoc.getForm();
          form.flatten();
        } catch (_) {
          // No form fields or already flat — safe to skip
        }
        processedBuffer = Buffer.from(await pdfDoc.save({ useObjectStreams: true }));
      } catch (flatErr: any) {
        // Flatten failed — fall through with original bytes (non-fatal)
        console.warn('[upload-document] pdf-lib flatten skipped:', flatErr.message);
      }
    }

    // Build unique storage path: deal_id/uuid.ext
    const ext = ((file.originalname || 'file').split('.').pop() ?? 'bin').toLowerCase();
    const uuid = crypto.randomUUID();
    const storagePath = `${deal_id}/${uuid}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('deal-documents')
      .upload(storagePath, processedBuffer, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: false,
      });

    if (uploadErr) throw uploadErr;

    return res.status(200).json({
      path: storagePath,
      file_name: file.originalname,
      file_size: processedBuffer.length,
      mime_type: file.mimetype || 'application/octet-stream',
    });

  } catch (err: any) {
    console.error('[upload-document] error:', err);
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
}

// ─── Multipart parser ─────────────────────────────────────────────────────────
interface ParsedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

function parseMultipart(req: VercelRequest): Promise<{ file: ParsedFile | null; fields: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers as Record<string, string> });
    const fields: Record<string, string> = {};
    let fileData: ParsedFile | null = null;

    busboy.on('file', (_fieldname: string, stream: any, info: { filename: string; mimeType: string }) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        fileData = {
          buffer: Buffer.concat(chunks),
          originalname: info.filename,
          mimetype: info.mimeType,
        };
      });
    });

    busboy.on('field', (name: string, value: string) => {
      fields[name] = value;
    });

    busboy.on('finish', () => resolve({ file: fileData, fields }));
    busboy.on('error', (err: Error) => reject(err));

    (req as any).pipe(busboy);
  });
}
