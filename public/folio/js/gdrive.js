// Google Drive API v3 integration (OAuth 2.0 via Google Identity Services)
// Organizes milestone media into: My Drive / Folio / <Hobby Name> / <YYYY-MM-DD_Title.ext>

const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const STORAGE_KEYS = {
  clientId: 'folio_gdrive_client_id',
  autoSync: 'folio_gdrive_auto_sync',
  folderCache: 'folio_gdrive_folder_cache',
  rootFolderLink: 'folio_gdrive_root_link'
};

let gisLoadedPromise = null;
let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;

function loadGisScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadedPromise) return gisLoadedPromise;

  gisLoadedPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisLoadedPromise = null;
      reject(new Error('Could not load Google Sign-In script (check internet connection).'));
    };
    document.head.appendChild(script);
  });
  return gisLoadedPromise;
}

function sanitizeFileName(str = 'milestone') {
  return (
    str
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 64) || 'milestone'
  );
}

function extensionForMime(mime = '', mediaType = '') {
  const m = mime.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('jpeg') || m.includes('jpg') || mediaType === 'image') return 'jpg';
  if (m.includes('quicktime') || m.includes('mov')) return 'mov';
  if (m.includes('mp4')) return mediaType === 'audio' ? 'm4a' : 'mp4';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  if (m.includes('webm')) return 'webm';
  if (mediaType === 'video') return 'mp4';
  if (mediaType === 'audio') return 'webm';
  return 'bin';
}

function getFolderCache() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.folderCache) || '{}');
  } catch {
    return {};
  }
}

function setFolderCache(cache) {
  localStorage.setItem(STORAGE_KEYS.folderCache, JSON.stringify(cache));
}

export const gdrive = {
  getClientId() {
    return (localStorage.getItem(STORAGE_KEYS.clientId) || '').trim();
  },

  setClientId(id) {
    const clean = (id || '').trim();
    localStorage.setItem(STORAGE_KEYS.clientId, clean);
    tokenClient = null;
    accessToken = null;
    tokenExpiresAt = 0;
  },

  isAutoSyncEnabled() {
    const val = localStorage.getItem(STORAGE_KEYS.autoSync);
    return val === null ? true : val === 'true';
  },

  setAutoSyncEnabled(enabled) {
    localStorage.setItem(STORAGE_KEYS.autoSync, enabled ? 'true' : 'false');
  },

  isConfigured() {
    return Boolean(this.getClientId());
  },

  hasActiveToken() {
    return Boolean(accessToken && Date.now() < tokenExpiresAt - 30000);
  },

  getRootFolderLink() {
    return localStorage.getItem(STORAGE_KEYS.rootFolderLink) || null;
  },

  getHobbyFolderLink(hobbyName) {
    const cache = getFolderCache();
    return cache[`link:${hobbyName}`] || null;
  },

  disconnect() {
    if (accessToken && window.google?.accounts?.oauth2) {
      try {
        window.google.accounts.oauth2.revoke(accessToken, () => {});
      } catch {}
    }
    accessToken = null;
    tokenExpiresAt = 0;
    localStorage.removeItem(STORAGE_KEYS.folderCache);
    localStorage.removeItem(STORAGE_KEYS.rootFolderLink);
  },

  async ensureAccessToken({ interactive = true } = {}) {
    if (this.hasActiveToken()) return accessToken;

    const clientId = this.getClientId();
    if (!clientId) {
      throw new Error('Google OAuth Client ID is not configured in Settings.');
    }

    await loadGisScript();

    return new Promise((resolve, reject) => {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GDRIVE_SCOPE,
        callback: (resp) => {
          if (resp.error) {
            reject(new Error(resp.error_description || resp.error));
            return;
          }
          accessToken = resp.access_token;
          const expiresInSec = Number(resp.expires_in) || 3500;
          tokenExpiresAt = Date.now() + expiresInSec * 1000;
          resolve(accessToken);
        },
        error_callback: (err) => {
          reject(new Error(err?.message || 'Google Sign-In popup closed or blocked.'));
        }
      });

      tokenClient.requestAccessToken({ prompt: interactive ? '' : 'none' });
    });
  },

  async verifyFolderAlive(folderId, token) {
    if (!folderId) return false;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,trashed,webViewLink`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.id && !data.trashed);
  },

  async findOrCreateFolder(name, parentId = 'root', token) {
    const cache = getFolderCache();
    const cacheKey = `${parentId}::${name}`;
    if (cache[cacheKey]) {
      const ok = await this.verifyFolderAlive(cache[cacheKey], token);
      if (ok) return { id: cache[cacheKey], webViewLink: cache[`link:${name}`] };
    }

    const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = `name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&pageSize=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      throw new Error(`Drive folder lookup failed (${searchRes.status}): ${errText}`);
    }

    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      const folder = searchData.files[0];
      cache[cacheKey] = folder.id;
      if (folder.webViewLink) cache[`link:${name}`] = folder.webViewLink;
      setFolderCache(cache);
      return folder;
    }

    // Create folder if not found
    const createRes = await fetch(
      'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId]
        })
      }
    );

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Drive folder creation failed (${createRes.status}): ${errText}`);
    }

    const created = await createRes.json();
    cache[cacheKey] = created.id;
    if (created.webViewLink) cache[`link:${name}`] = created.webViewLink;
    setFolderCache(cache);
    return created;
  },

  async ensureHobbyFolder(hobbyName, token) {
    const rootFolder = await this.findOrCreateFolder('Folio', 'root', token);
    if (rootFolder.webViewLink) {
      localStorage.setItem(STORAGE_KEYS.rootFolderLink, rootFolder.webViewLink);
    }
    const cleanHobby = (hobbyName || 'General').trim();
    const hobbyFolder = await this.findOrCreateFolder(cleanHobby, rootFolder.id, token);
    return { rootFolder, hobbyFolder };
  },

  async uploadBlobToFolder({ blob, fileName, mimeType, folderId, description }, token) {
    // Try Resumable Upload first (handles large videos cleanly without memory spikes)
    const initRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mimeType,
          'X-Upload-Content-Length': String(blob.size)
        },
        body: JSON.stringify({
          name: fileName,
          parents: [folderId],
          description
        })
      }
    );

    if (initRes.ok) {
      const uploadUrl = initRes.headers.get('Location');
      if (uploadUrl) {
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': mimeType },
          body: blob
        });
        if (putRes.ok) {
          return await putRes.json();
        }
      }
    }

    // Fallback: binary multipart/related upload
    const boundary = 'folio_multipart_' + Date.now();
    const metadata = JSON.stringify({
      name: fileName,
      parents: [folderId],
      description
    });
    const preamble =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`;
    const epilogue = `\r\n--${boundary}--`;

    const bodyBlob = new Blob([preamble, blob, epilogue], {
      type: `multipart/related; boundary=${boundary}`
    });

    const multiRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: bodyBlob
      }
    );

    if (!multiRes.ok) {
      const errText = await multiRes.text();
      throw new Error(`Drive upload failed (${multiRes.status}): ${errText}`);
    }
    return await multiRes.json();
  },

  async uploadMilestoneMedia({ milestone, hobbyName, mediaRecord, interactive = true }) {
    if (!mediaRecord || !mediaRecord.data) {
      throw new Error('No media attached to this milestone.');
    }

    const token = await this.ensureAccessToken({ interactive });
    const { rootFolder, hobbyFolder } = await this.ensureHobbyFolder(hobbyName, token);

    let blob = mediaRecord.data;
    if (typeof blob === 'string' && blob.startsWith('data:')) {
      const res = await fetch(blob);
      blob = await res.blob();
    }

    const mimeType = mediaRecord.mimeType || blob.type || 'application/octet-stream';
    const ext = extensionForMime(mimeType, milestone.mediaType);
    const dateStr = new Date(milestone.timestamp || Date.now()).toISOString().slice(0, 10);
    const fileName = `${dateStr}_${sanitizeFileName(milestone.title)}.${ext}`;

    const descParts = [`Hobby: ${hobbyName}`, `Milestone: ${milestone.title}`];
    if (milestone.badge) descParts.push(`Badge: ${milestone.badge}`);
    if (milestone.rating) descParts.push(`Rating: ${milestone.rating}/5`);
    if (milestone.note) descParts.push(`Notes: ${milestone.note}`);

    const uploaded = await this.uploadBlobToFolder(
      {
        blob,
        fileName,
        mimeType,
        folderId: hobbyFolder.id,
        description: descParts.join(' | ')
      },
      token
    );

    return {
      fileId: uploaded.id,
      fileName: uploaded.name || fileName,
      webViewLink: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
      hobbyFolderId: hobbyFolder.id,
      hobbyFolderLink:
        hobbyFolder.webViewLink || `https://drive.google.com/drive/folders/${hobbyFolder.id}`,
      rootFolderLink:
        rootFolder.webViewLink || `https://drive.google.com/drive/folders/${rootFolder.id}`
    };
  },

  // Update or create Folio/Folio_Milestones_Index.csv so the parent folder has a master list
  async syncMilestonesIndexCsv(milestones, hobbies) {
    if (!this.hasActiveToken()) return;
    const token = accessToken;
    const rootFolder = await this.findOrCreateFolder('Folio', 'root', token);
    const hobbyMap = new Map(hobbies.map((h) => [h.id, h.name]));

    const escCsv = (val = '') => `"${String(val).replace(/"/g, '""')}"`;
    const rows = [
      ['Date', 'Hobby', 'Milestone', 'Media Type', 'Badge / PR', 'Rating', 'Notes', 'Google Drive Link'].join(',')
    ];

    milestones.forEach((m) => {
      const d = new Date(m.timestamp || Date.now()).toISOString().slice(0, 10);
      rows.push(
        [
          escCsv(d),
          escCsv(hobbyMap.get(m.hobbyId) || 'Hobby'),
          escCsv(m.title),
          escCsv(m.mediaType || 'none'),
          escCsv(m.badge || ''),
          escCsv(m.rating || ''),
          escCsv(m.note || ''),
          escCsv(m.driveWebViewLink || '')
        ].join(',')
      );
    });

    const csvBlob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const indexName = 'Folio_Milestones_Index.csv';
    const q = `name = '${indexName}' and '${rootFolder.id}' in parents and trashed = false`;
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const searchData = searchRes.ok ? await searchRes.json() : { files: [] };

    if (searchData.files?.length > 0) {
      const existingId = searchData.files[0].id;
      await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingId)}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'text/csv;charset=utf-8'
          },
          body: csvBlob
        }
      );
    } else {
      await this.uploadBlobToFolder(
        {
          blob: csvBlob,
          fileName: indexName,
          mimeType: 'text/csv',
          folderId: rootFolder.id,
          description: 'Master index of Folio hobby milestones and media links'
        },
        token
      );
    }
  }
};

// Optional local disk mirror when running via Folio's local server.py
export async function mirrorMediaLocally({ milestone, hobbyName, blobOrDataUrl, mimeType }) {
  try {
    let blob = blobOrDataUrl;
    if (typeof blob === 'string' && blob.startsWith('data:')) {
      const r = await fetch(blob);
      blob = await r.blob();
    }
    if (!(blob instanceof Blob)) return null;

    const ext = extensionForMime(mimeType || blob.type, milestone.mediaType);
    const dateStr = new Date(milestone.timestamp || Date.now()).toISOString().slice(0, 10);
    const fileName = `${dateStr}_${sanitizeFileName(milestone.title)}.${ext}`;

    const res = await fetch('/api/local-mirror', {
      method: 'POST',
      headers: {
        'Content-Type': mimeType || blob.type || 'application/octet-stream',
        'X-Folio-Hobby': encodeURIComponent(hobbyName || 'General'),
        'X-Folio-Filename': encodeURIComponent(fileName),
        'X-Folio-Title': encodeURIComponent(milestone.title || '')
      },
      body: blob
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Gracefully ignore when hosted statically without server.py
    return null;
  }
}
