import type { VercelRequest, VercelResponse } from '@vercel/node';

const ACTIVE_DEALS_ROOT = '1Dfqf3pYXelt6tLJ9ryRYyQBOXMrsilDI'; // TC Command root

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.query;

  if (action === 'create-client-folder') {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });

    // Google Drive API requires a service account (not yet configured).
    // Return a graceful fallback so the wizard can still show the Drive link.
    return res.json({
      success: false,
      manual: true,
      path: `TC Command - MyReDeal / Active Deals / ${name}`,
      driveUrl: `https://drive.google.com/drive/folders/${ACTIVE_DEALS_ROOT}`,
    });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
