import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';

const ACTIVE_DEALS_SEARCH_PARENT = '1Dfqf3pYXelt6tLJ9ryRYyQBOXMrsilDI'; // TC Command root

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.query;

  if (action === 'create-client-folder') {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });

      // If no service account, return graceful fallback
      if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        return res.json({
          success: false,
          manual: true,
          path: `TC Command - MyReDeal / Active Deals / ${name}`,
          driveUrl: `https://drive.google.com/drive/folders/${ACTIVE_DEALS_SEARCH_PARENT}`,
        });
      }

      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
        scopes: ['https://www.googleapis.com/auth/drive'],
      });

      const drive = google.drive({ version: 'v3', auth });

      // Find or create Active Deals folder under root
      const searchRes = await drive.files.list({
        q: `name = 'Active Deals' and '${ACTIVE_DEALS_SEARCH_PARENT}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      let activeDealsFolderId = searchRes.data.files?.[0]?.id;

      if (!activeDealsFolderId) {
        const created = await drive.files.create({
          requestBody: {
            name: 'Active Deals',
            mimeType: 'application/vnd.google-apps.folder',
            parents: [ACTIVE_DEALS_SEARCH_PARENT],
          },
          fields: 'id',
          supportsAllDrives: true,
        });
        activeDealsFolderId = created.data.id!;
      }

      // Create client folder under Active Deals
      const folder = await drive.files.create({
        requestBody: {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [activeDealsFolderId],
        },
        fields: 'id, webViewLink',
        supportsAllDrives: true,
      });

      return res.json({
        success: true,
        folderId: folder.data.id,
        folderUrl: folder.data.webViewLink,
      });
    } catch (err: any) {
      console.error('drive create-client-folder error:', err);
      // Graceful fallback instead of hard error
      return res.json({
        success: false,
        manual: true,
        path: `TC Command - MyReDeal / Active Deals / ${req.body?.name || 'Client'}`,
        driveUrl: `https://drive.google.com/drive/folders/${ACTIVE_DEALS_SEARCH_PARENT}`,
        error: err.message,
      });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
}
