// IndexedDB storage, media blob management, and rich editorial seed data

const DB_NAME = 'folio_db_v1';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('hobbies')) {
        db.createObjectStore('hobbies', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('hobbyId', 'hobbyId', { unique: false });
        s.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains('milestones')) {
        const m = db.createObjectStore('milestones', { keyPath: 'id' });
        m.createIndex('hobbyId', 'hobbyId', { unique: false });
        m.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains('media')) {
        db.createObjectStore('media', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function txOp(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = fn(store);
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const db = {
  async getAll(storeName) {
    return txOp(storeName, 'readonly', (s) => s.getAll());
  },
  async get(storeName, id) {
    return txOp(storeName, 'readonly', (s) => s.get(id));
  },
  async put(storeName, item) {
    return txOp(storeName, 'readwrite', (s) => s.put(item));
  },
  async delete(storeName, id) {
    return txOp(storeName, 'readwrite', (s) => s.delete(id));
  },
  async clear(storeName) {
    return txOp(storeName, 'readwrite', (s) => s.clear());
  },
  async saveMedia(blobOrDataUrl, mimeType = 'image/jpeg') {
    const id = 'media_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    await this.put('media', { id, data: blobOrDataUrl, mimeType, createdAt: Date.now() });
    return id;
  },
  async getMediaUrl(mediaId) {
    if (!mediaId) return null;
    const record = await this.get('media', mediaId);
    if (!record) return null;
    if (typeof record.data === 'string') return record.data;
    if (record.data instanceof Blob) return URL.createObjectURL(record.data);
    return null;
  }
};

// Compress uploaded/captured mobile camera photos cleanly before IndexedDB storage
export function compressImageFile(file, maxDim = 1100, quality = 0.84) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else resolve(canvas.toDataURL('image/jpeg', quality));
          },
          'image/jpeg',
          quality
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Generate warm editorial illustrations for initial seed milestones (100% offline)
function generateSketchArtwork() {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 480;
  const ctx = c.getContext('2d');

  // Toned warm sketchbook paper
  const bg = ctx.createLinearGradient(0, 0, 640, 480);
  bg.addColorStop(0, '#F3E9DC');
  bg.addColorStop(1, '#E5D5C1');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 640, 480);

  // Subtle paper grain lines
  ctx.strokeStyle = 'rgba(92, 67, 48, 0.05)';
  ctx.lineWidth = 1;
  for (let y = 12; y < 480; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(640, y);
    ctx.stroke();
  }

  // Dramatic chiaroscuro light beam
  const light = ctx.createRadialGradient(230, 170, 20, 280, 220, 260);
  light.addColorStop(0, 'rgba(255, 252, 245, 0.65)');
  light.addColorStop(1, 'rgba(194, 84, 58, 0)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, 640, 480);

  // Sculptural portrait study silhouette & planes (sanguine + charcoal)
  ctx.save();
  ctx.translate(320, 235);

  // Shadow cast
  ctx.fillStyle = 'rgba(72, 46, 38, 0.16)';
  ctx.beginPath();
  ctx.ellipse(38, 125, 120, 34, -0.1, 0, Math.PI * 2);
  ctx.fill();

  // Head & neck form
  ctx.fillStyle = '#D9BEA5';
  ctx.beginPath();
  ctx.ellipse(-8, -22, 76, 98, 0.08, 0, Math.PI * 2);
  ctx.fill();

  // Core shadow side (Rembrandt lighting)
  ctx.fillStyle = 'rgba(138, 62, 44, 0.42)';
  ctx.beginPath();
  ctx.arc(-4, -22, 86, -Math.PI * 0.42, Math.PI * 0.58);
  ctx.quadraticCurveTo(8, 10, -4, -108);
  ctx.fill();

  // Charcoal construction & hatching lines
  ctx.strokeStyle = 'rgba(46, 33, 29, 0.72)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(-8, -22, 77, 99, 0.08, 0, Math.PI * 2);
  ctx.stroke();

  // Loomis construction cross-contours
  ctx.strokeStyle = 'rgba(155, 68, 48, 0.45)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-88, -28);
  ctx.quadraticCurveTo(-8, -14, 72, -22);
  ctx.moveTo(-12, -124);
  ctx.quadraticCurveTo(-22, -20, -14, 82);
  ctx.stroke();

  // Hatching strokes on shadow plane
  ctx.strokeStyle = 'rgba(44, 30, 26, 0.45)';
  ctx.lineWidth = 1.3;
  for (let i = -65; i < 65; i += 7) {
    ctx.beginPath();
    ctx.moveTo(14, i);
    ctx.lineTo(62 - Math.abs(i) * 0.35, i + 16);
    ctx.stroke();
  }

  // White chalk highlight
  ctx.strokeStyle = 'rgba(255, 253, 250, 0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(-28, -42, 46, Math.PI * 0.95, Math.PI * 1.42);
  ctx.stroke();

  ctx.restore();

  // Artist study notation in corner
  ctx.fillStyle = 'rgba(72, 46, 38, 0.65)';
  ctx.font = 'italic 18px Georgia, serif';
  ctx.fillText('Study #14 — Rembrandt Value Planes', 36, 444);

  return c.toDataURL('image/jpeg', 0.86);
}

function generateCookingArtwork() {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 480;
  const ctx = c.getContext('2d');

  // Linen tabletop
  ctx.fillStyle = '#ECE7DF';
  ctx.fillRect(0, 0, 640, 480);

  // Subtle linen weave
  ctx.fillStyle = '#DFD8CD';
  for (let x = 0; x < 640; x += 24) {
    ctx.fillRect(x, 0, 1, 480);
  }

  // Chopsticks resting on side
  ctx.strokeStyle = '#5C3D28';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(470, 75);
  ctx.lineTo(595, 405);
  ctx.moveTo(492, 68);
  ctx.lineTo(612, 398);
  ctx.stroke();

  // Bowl drop shadow
  ctx.fillStyle = 'rgba(28, 25, 23, 0.14)';
  ctx.beginPath();
  ctx.arc(306, 252, 168, 0, Math.PI * 2);
  ctx.fill();

  // Stoneware ceramic bowl
  ctx.fillStyle = '#2A2927';
  ctx.beginPath();
  ctx.arc(294, 240, 166, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#D8CFC2';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(294, 240, 158, 0, Math.PI * 2);
  ctx.stroke();

  // Rich chili bean sauce base
  const sauce = ctx.createRadialGradient(280, 225, 20, 294, 240, 144);
  sauce.addColorStop(0, '#B8331E');
  sauce.addColorStop(0.75, '#8F2112');
  sauce.addColorStop(1, '#66150A');
  ctx.fillStyle = sauce;
  ctx.beginPath();
  ctx.arc(294, 240, 144, 0, Math.PI * 2);
  ctx.fill();

  // Silken tofu cubes
  const cubes = [
    [235, 185, 42, 38, 0.12],
    [295, 175, 44, 40, -0.08],
    [348, 212, 40, 38, 0.22],
    [215, 242, 44, 38, -0.15],
    [278, 236, 46, 42, 0.06],
    [332, 272, 42, 38, -0.12],
    [252, 292, 40, 36, 0.18]
  ];
  cubes.forEach(([x, y, w, h, rot]) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
    ctx.fillStyle = '#F7EFE1';
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 7);
    ctx.fill();
    // Chili glaze gloss
    ctx.fillStyle = 'rgba(184, 51, 30, 0.22)';
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 4, -h / 2 + 4, w - 12, h - 14, 5);
    ctx.fill();
    ctx.restore();
  });

  // Scallion greens & toasted Sichuan peppercorn specks
  const scallions = [
    [270, 215], [308, 245], [258, 255], [322, 218],
    [288, 276], [242, 218], [344, 252], [295, 198]
  ];
  scallions.forEach(([x, y]) => {
    ctx.fillStyle = '#4E7D44';
    ctx.beginPath();
    ctx.ellipse(x, y, 8, 4.5, (x + y) * 0.1, 0, Math.PI * 2);
    ctx.fill();
  });

  return c.toDataURL('image/jpeg', 0.86);
}

// Date utilities for current Monday–Sunday week
export function getStartOfCurrentWeek(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay(); // 0 = Sun, 1 = Mon...
  const diffToMon = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMon);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getDayIndexMonSun(timestamp) {
  const d = new Date(timestamp);
  const day = d.getDay();
  return day === 0 ? 6 : day - 1; // 0 = Mon ... 6 = Sun
}

export async function ensureInitialData() {
  const existing = await db.getAll('hobbies');
  if (existing && existing.length > 0) return;

  const now = Date.now();
  const DAY = 86400000;
  const weekStart = getStartOfCurrentWeek(new Date(now)).getTime();

  // Save sample media blobs so the Bento Grid & Milestone Gallery shine out-of-the-box
  const sketchMediaId = await db.saveMedia(generateSketchArtwork(), 'image/jpeg');
  const dishMediaId = await db.saveMedia(generateCookingArtwork(), 'image/jpeg');

  const hobbies = [
    {
      id: 'hobby_piano',
      name: 'Piano',
      icon: '🎹',
      archetype: 'pipeline', // Multi-stage repertoire / project pipeline
      span: 'wide',
      accent: '#9A5B25',
      tint: '#FBF5EE',
      weeklyTarget: 4,
      activeTitle: 'Clair de Lune — Debussy',
      activeSubtitle: 'Mm. 27–50 arpeggios · 76 BPM',
      stages: ['Notes', 'Hands Together', 'Up to Tempo', 'Polished'],
      stageIndex: 2,
      order: 1
    },
    {
      id: 'hobby_drawing',
      name: 'Drawing',
      icon: '✏️',
      archetype: 'visual', // Visual study series + gallery preview
      span: 'tall',
      accent: '#C2543A',
      tint: '#FCF3F0',
      weeklyTarget: 3,
      activeTitle: 'Portrait Lighting Studies',
      activeSubtitle: 'Charcoal & sanguine on toned paper',
      progressCurrent: 14,
      progressTarget: 30,
      progressUnit: 'studies',
      coverMediaId: sketchMediaId,
      order: 2
    },
    {
      id: 'hobby_cooking',
      name: 'Cooking',
      icon: '🍳',
      archetype: 'collection', // Dish collection + technique exploration
      span: 'tall',
      accent: '#4A6B49',
      tint: '#F2F7F2',
      weeklyTarget: 2,
      activeTitle: 'Sichuan Wok & Pan Sauces',
      activeSubtitle: 'Balancing mala heat, aromatics & gloss',
      progressCurrent: 12,
      progressTarget: 20,
      progressUnit: 'dishes',
      coverMediaId: dishMediaId,
      order: 3
    },
    {
      id: 'hobby_workout',
      name: 'Working Out',
      icon: '🏋️',
      archetype: 'rhythm', // Consistency & quantitative PRs
      span: 'normal',
      accent: '#2E5A88',
      tint: '#F0F5FA',
      weeklyTarget: 4,
      activeTitle: 'Upper / Lower Strength',
      activeSubtitle: 'Squat 225 lb · Bench 165 lb',
      progressCurrent: 38,
      progressTarget: 50,
      progressUnit: 'workouts',
      order: 4
    },
    {
      id: 'hobby_chinese',
      name: 'Chinese',
      icon: '🏮',
      glyph: '漢',
      archetype: 'cumulative', // Cumulative tiered progression
      span: 'normal',
      accent: '#B43B3B',
      tint: '#FCF2F2',
      weeklyTarget: 5,
      tierLabel: 'HSK 2',
      activeTitle: 'HSK 2 Hanzi & Graded Readers',
      activeSubtitle: '65 characters to HSK 2 completion',
      progressCurrent: 235,
      progressTarget: 300,
      progressUnit: 'Hanzi',
      order: 5
    }
  ];

  for (const h of hobbies) {
    await db.put('hobbies', h);
  }

  // Seed realistic sessions distributed across the current week (up to today)
  const todayIdx = getDayIndexMonSun(now);
  const clampDay = (idx) => weekStart + Math.min(idx, todayIdx) * DAY + 19 * 3600000;

  const sampleSessions = [
    {
      id: 'sess_1',
      hobbyId: 'hobby_piano',
      minutes: 35,
      note: 'Smoothed out the left-hand rolling chords in m. 29–34 at 72 BPM.',
      timestamp: clampDay(0),
      isSample: true
    },
    {
      id: 'sess_2',
      hobbyId: 'hobby_chinese',
      minutes: 25,
      note: 'Anki review + 8 new characters from Mandarin Companion chapter 3.',
      timestamp: clampDay(0) + 3600000,
      isSample: true
    },
    {
      id: 'sess_3',
      hobbyId: 'hobby_workout',
      minutes: 55,
      note: 'Upper body hypertrophy — incline DB press felt super stable.',
      timestamp: clampDay(1),
      isSample: true
    },
    {
      id: 'sess_4',
      hobbyId: 'hobby_drawing',
      minutes: 45,
      note: 'Study #14: Focused on soft vs. hard shadow edges along the cheekbone.',
      timestamp: clampDay(2),
      isSample: true
    },
    {
      id: 'sess_5',
      hobbyId: 'hobby_chinese',
      minutes: 20,
      note: 'Shadowing tone pairs (2nd + 3rd tone combinations) and listening drill.',
      timestamp: clampDay(2) + 5400000,
      isSample: true
    },
    {
      id: 'sess_6',
      hobbyId: 'hobby_piano',
      minutes: 40,
      note: 'Connected A-section into the tempo rubato middle section hands together!',
      timestamp: clampDay(3),
      isSample: true
    },
    {
      id: 'sess_7',
      hobbyId: 'hobby_workout',
      minutes: 50,
      note: 'Lower body strength — hit 3x5 at 225 lb squat with clean depth.',
      timestamp: clampDay(3) - 7200000,
      isSample: true
    },
    {
      id: 'sess_8',
      hobbyId: 'hobby_cooking',
      minutes: 50,
      note: 'Toasted whole Sichuan peppercorns in dry wok first — huge aroma upgrade.',
      timestamp: clampDay(4),
      isSample: true
    },
    {
      id: 'sess_9',
      hobbyId: 'hobby_chinese',
      minutes: 30,
      note: 'Read 6 pages without looking up pinyin; hit 235 Hanzi milestone.',
      timestamp: now - 3600000 * 3,
      isSample: true
    }
  ];

  for (const s of sampleSessions) {
    await db.put('sessions', s);
  }

  const sampleMilestones = [
    {
      id: 'ms_1',
      hobbyId: 'hobby_cooking',
      title: 'Authentic Mapo Tofu from Scratch',
      note: 'Nailed the doubanjiang bloom & silky cornstarch emulsion without breaking the tofu.',
      mediaId: dishMediaId,
      mediaType: 'image',
      rating: 5,
      badge: 'Signature Dish #12',
      timestamp: now - DAY * 1.2,
      isSample: true
    },
    {
      id: 'ms_2',
      hobbyId: 'hobby_drawing',
      title: 'Study #14 — Chiaroscuro Portrait',
      note: 'First portrait study where the 3-value grouping read cleanly from across the room.',
      mediaId: sketchMediaId,
      mediaType: 'image',
      badge: '14 / 30 Studies',
      timestamp: now - DAY * 2.5,
      isSample: true
    },
    {
      id: 'ms_3',
      hobbyId: 'hobby_piano',
      title: 'Clair de Lune — Opening & Rubato Phrase',
      note: 'Recorded a clean take of the first two pages with pedaling and dynamic shaping.',
      mediaType: 'demo_piano', // Synthesizes warm Debussy-inspired chords when tapped!
      badge: 'Clean Take',
      timestamp: now - DAY * 3.4,
      isSample: true
    },
    {
      id: 'ms_4',
      hobbyId: 'hobby_workout',
      title: '225 lb Barbell Squat (3×5 PR)',
      note: 'Two-plate squat milestone! Controlled eccentric, zero knee cave.',
      badge: '225 lb PR',
      timestamp: now - DAY * 5,
      isSample: true
    },
    {
      id: 'ms_5',
      hobbyId: 'hobby_chinese',
      title: 'Finished First 300-Character Graded Reader',
      note: 'Read "The Secret Garden" (Mandarin Companion Level 1) cover-to-cover in Hanzi.',
      badge: '200+ Hanzi',
      timestamp: now - DAY * 7,
      isSample: true
    }
  ];

  for (const m of sampleMilestones) {
    await db.put('milestones', m);
  }
}

export async function clearSampleEntriesOnly() {
  const sessions = await db.getAll('sessions');
  for (const s of sessions) {
    if (s.isSample) await db.delete('sessions', s.id);
  }
  const milestones = await db.getAll('milestones');
  for (const m of milestones) {
    if (m.isSample) await db.delete('milestones', m.id);
  }
  const hobbies = await db.getAll('hobbies');
  for (const h of hobbies) {
    if (h.coverMediaId) {
      delete h.coverMediaId;
      await db.put('hobbies', h);
    }
  }
}
