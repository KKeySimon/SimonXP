import {
  db,
  compressImageFile,
  ensureInitialData,
  clearSampleEntriesOnly,
  getStartOfCurrentWeek,
  getDayIndexMonSun
} from './db.js';
import { audioRecorder, playDemoPianoPhrase } from './audio.js';
import { gdrive, mirrorMediaLocally } from './gdrive.js';

const state = {
  activeTab: 'bento',
  milestoneFilter: 'all',
  hobbies: [],
  sessions: [],
  milestones: [],
  mediaUrls: new Map(),
  // Live practice timer state
  timerRunning: false,
  timerSeconds: 0,
  timerInterval: null,
  // Active audio playback tracking
  activeAudioEl: null,
  activeAudioCardId: null
};

const PALETTES = [
  { name: 'Amber Brass', accent: '#9A5B25', tint: '#FBF5EE' },
  { name: 'Terracotta', accent: '#C2543A', tint: '#FCF3F0' },
  { name: 'Sage Olive', accent: '#4A6B49', tint: '#F2F7F2' },
  { name: 'Slate Cobalt', accent: '#2E5A88', tint: '#F0F5FA' },
  { name: 'Vermilion Ink', accent: '#B43B3B', tint: '#FCF2F2' },
  { name: 'Plum Aubergine', accent: '#6D437A', tint: '#F7F2F9' }
];

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDuration(mins) {
  const m = Math.round(Number(mins) || 0);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function formatRelativeDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays <= 0 && d.getDate() === now.getDate()) return 'Today';
  if (diffDays <= 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function showToast(msg, duration = 2600) {
  const el = document.getElementById('toastBanner');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add('hidden'), duration);
}

async function resolveMediaUrl(mediaId) {
  if (!mediaId) return null;
  if (state.mediaUrls.has(mediaId)) return state.mediaUrls.get(mediaId);
  const url = await db.getMediaUrl(mediaId);
  if (url) state.mediaUrls.set(mediaId, url);
  return url;
}

async function loadAllData() {
  const [hobbies, sessions, milestones] = await Promise.all([
    db.getAll('hobbies'),
    db.getAll('sessions'),
    db.getAll('milestones')
  ]);

  state.hobbies = hobbies.sort((a, b) => (a.order || 99) - (b.order || 99));
  state.sessions = sessions.sort((a, b) => b.timestamp - a.timestamp);
  state.milestones = milestones.sort((a, b) => b.timestamp - a.timestamp);

  const mediaIds = new Set();
  state.hobbies.forEach((h) => h.coverMediaId && mediaIds.add(h.coverMediaId));
  state.milestones.forEach((m) => m.mediaId && mediaIds.add(m.mediaId));
  await Promise.all([...mediaIds].map((id) => resolveMediaUrl(id)));
}

function getWeekSessions() {
  const weekStart = getStartOfCurrentWeek().getTime();
  return state.sessions.filter((s) => s.timestamp >= weekStart);
}

function renderHeaderDate() {
  const now = new Date();
  const label = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });
  document.getElementById('headerDate').textContent = label.toUpperCase();
}

function renderDriveHeaderBadge() {
  const dot = document.getElementById('driveStatusDot');
  const lbl = document.getElementById('driveStatusLabel');
  if (!dot || !lbl) return;

  dot.classList.remove('connected', 'configured');
  if (gdrive.hasActiveToken()) {
    dot.classList.add('connected');
    lbl.textContent = 'Drive ✓';
  } else if (gdrive.isConfigured()) {
    dot.classList.add('configured');
    lbl.textContent = 'Drive';
  } else {
    lbl.textContent = 'Drive';
  }
}

// Upload a single milestone's media to Google Drive (Folio / <Hobby Name> / ...)
async function syncSingleMilestoneToDrive(milestoneId, { interactive = true } = {}) {
  const milestone = state.milestones.find((m) => m.id === milestoneId);
  if (!milestone || !milestone.mediaId) {
    showToast('This milestone has no photo, video, or audio file attached.');
    return false;
  }

  if (!gdrive.isConfigured()) {
    openSettingsSheet({ focusDrive: true });
    showToast('Add your Google Client ID to connect Google Drive');
    return false;
  }

  const hobby = state.hobbies.find((h) => h.id === milestone.hobbyId);
  const hobbyName = hobby?.name || 'General';
  const mediaRecord = await db.get('media', milestone.mediaId);
  if (!mediaRecord) {
    showToast('Media file not found in local storage.');
    return false;
  }

  try {
    showToast(`Uploading to Google Drive → Folio/${hobbyName}/...`, 4500);
    const res = await gdrive.uploadMilestoneMedia({
      milestone,
      hobbyName,
      mediaRecord,
      interactive
    });

    milestone.driveFileId = res.fileId;
    milestone.driveWebViewLink = res.webViewLink;
    milestone.driveFolderLink = res.hobbyFolderLink;
    await db.put('milestones', milestone);

    if (hobby && res.hobbyFolderLink) {
      hobby.driveFolderLink = res.hobbyFolderLink;
      await db.put('hobbies', hobby);
    }

    await loadAllData();
    await gdrive.syncMilestonesIndexCsv(state.milestones, state.hobbies).catch(() => {});
    await refreshAllViews();
    showToast(`☁️ Uploaded to Folio/${hobbyName} in Google Drive!`);
    return true;
  } catch (err) {
    showToast(`Drive upload paused: ${err.message || 'Check connection'}`, 3800);
    renderDriveHeaderBadge();
    return false;
  }
}

// ============================================================================
// VIEW 1: CONSOLIDATED BENTO DASHBOARD
// ============================================================================
function renderWeeklyPulse() {
  const mount = document.getElementById('weeklyPulseMount');
  const weekSessions = getWeekSessions();
  const totalMinutes = weekSessions.reduce((acc, s) => acc + (Number(s.minutes) || 0), 0);
  const touchedHobbies = new Set(weekSessions.map((s) => s.hobbyId));
  const hobbyMap = new Map(state.hobbies.map((h) => [h.id, h]));

  const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const todayIdx = getDayIndexMonSun(Date.now());
  const dayBuckets = Array.from({ length: 7 }, () => []);

  weekSessions.forEach((s) => {
    const idx = getDayIndexMonSun(s.timestamp);
    if (idx >= 0 && idx < 7) {
      const h = hobbyMap.get(s.hobbyId);
      if (h && !dayBuckets[idx].some((item) => item.id === h.id)) {
        dayBuckets[idx].push(h);
      }
    }
  });

  mount.innerHTML = `
    <div class="pulse-banner">
      <div class="pulse-top">
        <div>
          <span class="eyebrow" style="color: rgba(250,248,245,0.6);">THIS WEEK'S MOSAIC</span>
          <h2 class="pulse-headline">${
            touchedHobbies.size === 0
              ? 'Ready for your first session'
              : `${touchedHobbies.size} of ${state.hobbies.length} practices active`
          }</h2>
        </div>
        <div class="pulse-stats">
          <div>
            <div class="pulse-stat-val">${formatDuration(totalMinutes)}</div>
            <div class="pulse-stat-lbl">Invested</div>
          </div>
          <div>
            <div class="pulse-stat-val">${weekSessions.length}</div>
            <div class="pulse-stat-lbl">Sessions</div>
          </div>
        </div>
      </div>
      <div class="week-days-grid">
        ${dayNames
          .map((lbl, idx) => {
            const items = dayBuckets[idx];
            return `
              <div class="week-day-col ${idx === todayIdx ? 'is-today' : ''}">
                <span class="week-day-lbl">${lbl}</span>
                <div class="week-day-dots">
                  ${
                    items.length > 0
                      ? items
                          .map(
                            (h) =>
                              `<span class="day-hobby-dot" style="background:${h.accent}" title="${escapeHtml(h.name)}"></span>`
                          )
                          .join('')
                      : `<span class="day-empty-dot"></span>`
                  }
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function renderBentoCardBody(hobby, hobbyWeekSessions, latestMilestone) {
  const accent = hobby.accent || '#1C1917';
  const tint = hobby.tint || '#F3EFEA';

  if (hobby.archetype === 'pipeline') {
    const stages = hobby.stages || ['Started', 'Practicing', 'Refining', 'Polished'];
    const cur = Math.min(Math.max(Number(hobby.stageIndex) || 0, 0), stages.length - 1);
    return `
      <div>
        <span class="focus-label-pill" style="background:${tint}; color:${accent};">Repertoire In Progress</span>
        <h3 class="focus-title">${escapeHtml(hobby.activeTitle || 'Set an active piece')}</h3>
        ${hobby.activeSubtitle ? `<p class="focus-subtitle">${escapeHtml(hobby.activeSubtitle)}</p>` : ''}
        <div class="pipeline-track">
          ${stages
            .map((st, idx) => {
              const cls = idx < cur ? 'done' : idx === cur ? 'current' : '';
              return `
                <div class="stage-step ${cls}">
                  <div class="stage-bar"></div>
                  <span class="stage-name">${escapeHtml(st)}</span>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  if (hobby.archetype === 'visual' || hobby.archetype === 'collection') {
    const coverUrl =
      state.mediaUrls.get(hobby.coverMediaId) ||
      (latestMilestone?.mediaId ? state.mediaUrls.get(latestMilestone.mediaId) : null);
    const coverIsVideo =
      hobby.coverMediaType === 'video' ||
      (!hobby.coverMediaId && latestMilestone?.mediaType === 'video');
    const cur = Number(hobby.progressCurrent) || 0;
    const target = Math.max(Number(hobby.progressTarget) || 1, 1);
    const pct = Math.min(Math.round((cur / target) * 100), 100);
    const tagText = hobby.archetype === 'visual' ? 'Visual Study' : 'Collection';

    return `
      <div style="display:flex; flex-direction:column; gap:9px;">
        ${
          coverUrl
            ? `
          <div class="bento-media-preview">
            ${
              coverIsVideo
                ? `<video src="${coverUrl}" muted playsinline preload="metadata"></video>`
                : `<img src="${coverUrl}" alt="${escapeHtml(hobby.name)} latest artifact" loading="lazy" />`
            }
            <span class="media-corner-tag">${
              coverIsVideo
                ? '▶ Video'
                : latestMilestone?.rating
                ? '★'.repeat(latestMilestone.rating)
                : tagText
            }</span>
          </div>`
            : `<span class="focus-label-pill" style="background:${tint}; color:${accent}; align-self:flex-start;">${tagText}</span>`
        }
        <div>
          <h3 class="focus-title">${escapeHtml(hobby.activeTitle || 'Active Project')}</h3>
          ${hobby.activeSubtitle ? `<p class="focus-subtitle">${escapeHtml(hobby.activeSubtitle)}</p>` : ''}
        </div>
        <div class="meter-wrap">
          <div class="meter-meta">
            <span class="meter-nums">${cur} / ${target} ${escapeHtml(hobby.progressUnit || 'items')}</span>
            <span class="meter-pct">${pct}%</span>
          </div>
          <div class="meter-track">
            <div class="meter-fill" style="width:${pct}%"></div>
          </div>
        </div>
      </div>
    `;
  }

  if (hobby.archetype === 'rhythm') {
    const target = Math.max(Number(hobby.weeklyTarget) || 4, 1);
    const done = hobbyWeekSessions.length;
    return `
      <div>
        <span class="focus-label-pill" style="background:${tint}; color:${accent};">Consistency</span>
        <h3 class="focus-title">${escapeHtml(hobby.activeTitle || 'Training Block')}</h3>
        ${hobby.activeSubtitle ? `<p class="focus-subtitle">${escapeHtml(hobby.activeSubtitle)}</p>` : ''}
        <div class="session-blocks">
          ${Array.from({ length: Math.max(target, done) })
            .map((_, idx) => `<div class="session-block ${idx < done ? 'active' : ''}"></div>`)
            .join('')}
        </div>
        <div class="meter-meta" style="margin-top:6px; margin-bottom:0;">
          <span class="meter-nums">${done} of ${target} sessions</span>
          <span class="meter-pct">${done >= target ? 'Target met ✓' : 'This week'}</span>
        </div>
      </div>
    `;
  }

  const cur = Number(hobby.progressCurrent) || 0;
  const target = Math.max(Number(hobby.progressTarget) || 100, 1);
  const pct = Math.min(Math.round((cur / target) * 100), 100);
  return `
    <div>
      <span class="focus-label-pill" style="background:${tint}; color:${accent};">${escapeHtml(
    hobby.tierLabel || 'Cumulative Tier'
  )}</span>
      <h3 class="focus-title">${escapeHtml(hobby.activeTitle || 'Active Milestone')}</h3>
      ${hobby.activeSubtitle ? `<p class="focus-subtitle">${escapeHtml(hobby.activeSubtitle)}</p>` : ''}
      <div class="meter-wrap">
        <div class="meter-meta">
          <span class="meter-nums">${cur} / ${target} ${escapeHtml(hobby.progressUnit || 'units')}</span>
          <span class="meter-pct">${pct}%</span>
        </div>
        <div class="meter-track">
          <div class="meter-fill" style="width:${pct}%"></div>
        </div>
      </div>
    </div>
  `;
}

function renderBentoGrid() {
  const mount = document.getElementById('bentoGridMount');
  const weekSessions = getWeekSessions();

  mount.innerHTML = state.hobbies
    .map((hobby) => {
      const hobbyWeek = weekSessions.filter((s) => s.hobbyId === hobby.id);
      const weekMins = hobbyWeek.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
      const target = Math.max(Number(hobby.weeklyTarget) || 3, 1);
      const filledCount = Math.min(hobbyWeek.length, target);
      const latestMs = state.milestones.find((m) => m.hobbyId === hobby.id);
      const spanClass = `span-${hobby.span || 'normal'}`;

      return `
        <article
          class="bento-card ${spanClass}"
          data-hobby-id="${hobby.id}"
          style="--hobby-accent: ${hobby.accent};"
        >
          ${hobby.glyph ? `<span class="card-watermark" style="color:${hobby.accent}">${escapeHtml(hobby.glyph)}</span>` : ''}
          <div>
            <div class="bento-card-top">
              <div class="hobby-badge">
                <span class="hobby-icon-chip" style="background:${hobby.tint || '#F3EFEA'}">${hobby.icon || '✦'}</span>
                <span class="hobby-name">${escapeHtml(hobby.name)}</span>
              </div>
              <button
                class="quick-plus-btn"
                type="button"
                data-quick-log="${hobby.id}"
                title="Quick log ${escapeHtml(hobby.name)}"
                aria-label="Quick log ${escapeHtml(hobby.name)}"
              >+</button>
            </div>
            <div class="rhythm-row" style="margin-top:8px;">
              <div class="rhythm-dots" title="${hobbyWeek.length} / ${target} sessions this week">
                ${Array.from({ length: target })
                  .map((_, i) => `<span class="rhythm-dot ${i < filledCount ? 'filled' : ''}"></span>`)
                  .join('')}
              </div>
              <span class="rhythm-label">${weekMins > 0 ? `${formatDuration(weekMins)} wk` : `0/${target} wk`}</span>
            </div>
          </div>

          ${renderBentoCardBody(hobby, hobbyWeek, latestMs)}

          <div class="card-footer-meta">
            <span class="latest-ms-pill">
              ${latestMs ? `✦ ${escapeHtml(latestMs.badge || latestMs.title)}` : 'Tap to log milestone'}
            </span>
          </div>
        </article>
      `;
    })
    .join('');

  mount.querySelectorAll('[data-quick-log]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCaptureSheet({ mode: 'session', hobbyId: btn.dataset.quickLog });
    });
  });

  mount.querySelectorAll('.bento-card').forEach((card) => {
    card.addEventListener('click', () => {
      openHobbyDetailSheet(card.dataset.hobbyId);
    });
  });
}

function renderRecentMilestonesStrip() {
  const strip = document.getElementById('recentMilestonesStrip');
  const hobbyMap = new Map(state.hobbies.map((h) => [h.id, h]));
  const recent = state.milestones.slice(0, 6);

  if (recent.length === 0) {
    strip.innerHTML = `
      <div class="empty-state" style="width:100%; padding:22px;">
        No milestones saved yet — capture a finished dish, sketch, video clip, PR, or song!
      </div>
    `;
    return;
  }

  strip.innerHTML = recent
    .map((m) => {
      const h = hobbyMap.get(m.hobbyId);
      const mediaUrl = m.mediaId ? state.mediaUrls.get(m.mediaId) : null;
      return `
        <div class="ms-mini-card" data-goto-ms="${m.id}">
          ${
            m.mediaType === 'image' && mediaUrl
              ? `<img class="ms-mini-thumb" src="${mediaUrl}" alt="${escapeHtml(m.title)}" loading="lazy" />`
              : m.mediaType === 'video' && mediaUrl
              ? `<video class="ms-mini-thumb ms-mini-thumb-video" src="${mediaUrl}" muted playsinline preload="metadata"></video>`
              : `<div class="ms-mini-thumb" style="display:flex;align-items:center;justify-content:center;background:${
                  h?.tint || '#F2EFE9'
                };color:${h?.accent || '#1C1917'};font-size:24px;font-weight:700;">
                  ${
                    m.mediaType === 'audio' || m.mediaType === 'demo_piano'
                      ? '♪ Audio Take'
                      : escapeHtml(m.badge || h?.icon || '✦')
                  }
                </div>`
          }
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--ink-muted);">
            <span style="color:${h?.accent || 'inherit'};font-weight:650;">${h?.icon || ''} ${escapeHtml(h?.name || 'Hobby')}</span>
            <span>${m.driveWebViewLink ? '☁️ ' : ''}${formatRelativeDate(m.timestamp)}</span>
          </div>
          <h4 class="ms-mini-title">${escapeHtml(m.title)}</h4>
        </div>
      `;
    })
    .join('');

  strip.querySelectorAll('[data-goto-ms]').forEach((card) => {
    card.addEventListener('click', () => {
      switchTab('milestones');
    });
  });
}

// ============================================================================
// VIEW 2: UNIFIED MILESTONE VAULT (PHOTO + VIDEO + AUDIO + DRIVE LINKS)
// ============================================================================
function renderMilestonesVault() {
  const filtersMount = document.getElementById('milestoneFiltersMount');
  const galleryMount = document.getElementById('milestoneGalleryMount');
  const hobbyMap = new Map(state.hobbies.map((h) => [h.id, h]));

  filtersMount.innerHTML = [
    `<button class="filter-chip ${state.milestoneFilter === 'all' ? 'active' : ''}" data-filter="all" type="button">All (${state.milestones.length})</button>`,
    ...state.hobbies.map((h) => {
      const count = state.milestones.filter((m) => m.hobbyId === h.id).length;
      return `<button class="filter-chip ${state.milestoneFilter === h.id ? 'active' : ''}" data-filter="${h.id}" type="button">${h.icon} ${escapeHtml(h.name)} (${count})</button>`;
    })
  ].join('');

  filtersMount.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.milestoneFilter = btn.dataset.filter;
      renderMilestonesVault();
    });
  });

  const filtered =
    state.milestoneFilter === 'all'
      ? state.milestones
      : state.milestones.filter((m) => m.hobbyId === state.milestoneFilter);

  if (filtered.length === 0) {
    galleryMount.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <p style="margin:0 0 12px;">No milestones recorded here yet.</p>
        <button class="primary-pill-btn" type="button" id="btnEmptyAddMs">✦ Add First Milestone</button>
      </div>
    `;
    document.getElementById('btnEmptyAddMs')?.addEventListener('click', () => {
      openCaptureSheet({
        mode: 'milestone',
        hobbyId: state.milestoneFilter !== 'all' ? state.milestoneFilter : state.hobbies[0]?.id
      });
    });
    return;
  }

  const waveHeights = [40, 75, 55, 95, 65, 85, 45, 90, 60, 70, 50, 80, 45, 65, 50];

  galleryMount.innerHTML = filtered
    .map((m) => {
      const h = hobbyMap.get(m.hobbyId);
      const mediaUrl = m.mediaId ? state.mediaUrls.get(m.mediaId) : null;
      const isImage = m.mediaType === 'image' && mediaUrl;
      const isVideo = m.mediaType === 'video' && mediaUrl;
      const isAudio = m.mediaType === 'audio' || m.mediaType === 'demo_piano';

      return `
        <article class="ms-card">
          ${
            isImage
              ? `<img class="ms-card-media" src="${mediaUrl}" alt="${escapeHtml(m.title)}" data-lightbox-src="${mediaUrl}" data-lightbox-cap="${escapeHtml(m.title)}" />`
              : isVideo
              ? `<video class="ms-card-video" src="${mediaUrl}" controls playsinline preload="metadata"></video>`
              : ''
          }
          <div class="ms-card-body">
            <div class="ms-card-meta">
              <span class="ms-hobby-tag" style="color:${h?.accent || 'var(--ink)'}">
                <span>${h?.icon || '✦'}</span>
                <span>${escapeHtml(h?.name || 'Hobby')}</span>
              </span>
              <div style="display:flex;align-items:center;gap:8px;">
                ${
                  m.badge
                    ? `<span class="ms-badge-chip" style="background:${h?.tint || '#F2EFE9'};color:${h?.accent || '#1C1917'}">${escapeHtml(m.badge)}</span>`
                    : ''
                }
                <span>${formatRelativeDate(m.timestamp)}</span>
              </div>
            </div>

            <h3 class="ms-card-title">${escapeHtml(m.title)}</h3>
            ${m.rating ? `<div class="stars-row" aria-label="${m.rating} out of 5 stars">${'★'.repeat(m.rating)}${'☆'.repeat(5 - m.rating)}</div>` : ''}
            ${m.note ? `<p class="ms-card-note">${escapeHtml(m.note)}</p>` : ''}

            ${
              isAudio
                ? `
              <div class="audio-clip-box" id="audiobox_${m.id}">
                <button class="audio-play-btn" type="button" data-play-ms="${m.id}" aria-label="Play audio clip">▶</button>
                <div class="audio-wave-bars">
                  ${waveHeights.map((pct) => `<span style="height:${pct}%"></span>`).join('')}
                </div>
                <span style="font-size:11px;color:var(--ink-muted);font-weight:600;">${
                  m.mediaType === 'demo_piano' ? '0:06 Take' : 'Audio Clip'
                }</span>
              </div>`
                : ''
            }

            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;gap:8px;">
              <div>
                ${
                  m.driveWebViewLink
                    ? `<a class="drive-link-chip" href="${escapeHtml(m.driveWebViewLink)}" target="_blank" rel="noopener">☁️ Folio/${escapeHtml(h?.name || 'Drive')} ↗</a>`
                    : m.mediaId
                    ? `<button class="drive-link-chip" type="button" data-sync-drive="${m.id}">☁️ Upload to Drive</button>`
                    : ''
                }
              </div>
              <button class="text-link-btn" style="font-size:11.5px;color:var(--ink-muted);" data-del-ms="${m.id}" type="button">Remove</button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  galleryMount.querySelectorAll('[data-lightbox-src]').forEach((img) => {
    img.addEventListener('click', () => {
      openLightbox(img.dataset.lightboxSrc, img.dataset.lightboxCap);
    });
  });

  galleryMount.querySelectorAll('[data-play-ms]').forEach((btn) => {
    btn.addEventListener('click', () => handlePlayMilestoneAudio(btn.dataset.playMs, btn));
  });

  galleryMount.querySelectorAll('[data-sync-drive]').forEach((btn) => {
    btn.addEventListener('click', () => syncSingleMilestoneToDrive(btn.dataset.syncDrive));
  });

  galleryMount.querySelectorAll('[data-del-ms]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await db.delete('milestones', btn.dataset.delMs);
      await refreshAllViews();
      showToast('Milestone removed');
    });
  });
}

async function handlePlayMilestoneAudio(msId, btnEl) {
  const m = state.milestones.find((item) => item.id === msId);
  if (!m) return;
  const box = document.getElementById(`audiobox_${msId}`);

  if (m.mediaType === 'demo_piano') {
    const started = playDemoPianoPhrase(() => {
      box?.classList.remove('playing');
      if (btnEl) btnEl.textContent = '▶';
    });
    if (started) {
      box?.classList.add('playing');
      btnEl.textContent = '■';
    } else {
      box?.classList.remove('playing');
      btnEl.textContent = '▶';
    }
    return;
  }

  if (state.activeAudioEl && state.activeAudioCardId === msId) {
    state.activeAudioEl.pause();
    state.activeAudioEl = null;
    state.activeAudioCardId = null;
    box?.classList.remove('playing');
    btnEl.textContent = '▶';
    return;
  }

  if (state.activeAudioEl) {
    state.activeAudioEl.pause();
  }

  const url = await resolveMediaUrl(m.mediaId);
  if (!url) return;
  const audio = new Audio(url);
  state.activeAudioEl = audio;
  state.activeAudioCardId = msId;
  box?.classList.add('playing');
  btnEl.textContent = '■';
  audio.onended = () => {
    box?.classList.remove('playing');
    btnEl.textContent = '▶';
    state.activeAudioEl = null;
    state.activeAudioCardId = null;
  };
  audio.play();
}

// ============================================================================
// VIEW 3: SESSION JOURNAL & TIME BALANCE
// ============================================================================
function renderJournalView() {
  const balanceMount = document.getElementById('journalBalanceMount');
  const listMount = document.getElementById('journalListMount');
  const hobbyMap = new Map(state.hobbies.map((h) => [h.id, h]));
  const weekSessions = getWeekSessions();
  const totalWeekMins = weekSessions.reduce((s, x) => s + (Number(x.minutes) || 0), 0);

  const byHobby = state.hobbies
    .map((h) => {
      const mins = weekSessions
        .filter((s) => s.hobbyId === h.id)
        .reduce((acc, s) => acc + (Number(s.minutes) || 0), 0);
      return { hobby: h, mins };
    })
    .filter((item) => item.mins > 0);

  balanceMount.innerHTML = `
    <div class="balance-card">
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <span class="eyebrow">WEEKLY TIME DISTRIBUTION</span>
        <strong style="font-size:14px;">${formatDuration(totalWeekMins)} this week</strong>
      </div>
      <div class="stacked-bar">
        ${
          byHobby.length > 0
            ? byHobby
                .map(
                  ({ hobby, mins }) =>
                    `<div style="width:${(mins / totalWeekMins) * 100}%;background:${hobby.accent};" title="${escapeHtml(hobby.name)}: ${formatDuration(mins)}"></div>`
                )
                .join('')
            : `<div style="width:100%;background:var(--bg-subtle)"></div>`
        }
      </div>
      <div class="balance-legend">
        ${
          byHobby.length > 0
            ? byHobby
                .map(
                  ({ hobby, mins }) => `
                <span class="legend-item">
                  <span class="legend-swatch" style="background:${hobby.accent}"></span>
                  <span>${escapeHtml(hobby.name)} · <strong>${formatDuration(mins)}</strong></span>
                </span>`
                )
                .join('')
            : `<span>Log a session with the + button below to see your weekly hobby balance.</span>`
        }
      </div>
    </div>
  `;

  if (state.sessions.length === 0) {
    listMount.innerHTML = `<div class="empty-state">Your session logbook is empty. Tap + below to log a practice session!</div>`;
    return;
  }

  listMount.innerHTML = state.sessions
    .map((s) => {
      const h = hobbyMap.get(s.hobbyId);
      return `
        <div class="journal-item">
          <div class="journal-item-left">
            <span class="hobby-icon-chip" style="background:${h?.tint || '#F2EFE9'};margin-top:2px;">${h?.icon || '✦'}</span>
            <div>
              <div style="display:flex;align-items:center;gap:8px;">
                <strong style="font-size:14.5px;">${escapeHtml(h?.name || 'Hobby')}</strong>
                <span style="font-size:12px;color:var(--ink-muted);">${formatRelativeDate(s.timestamp)}</span>
              </div>
              ${s.note ? `<p class="journal-note">${escapeHtml(s.note)}</p>` : ''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
            <span class="duration-pill">${formatDuration(s.minutes)}</span>
            <button class="text-link-btn" style="font-size:11px;color:var(--ink-muted);" data-del-sess="${s.id}" type="button">Delete</button>
          </div>
        </div>
      `;
    })
    .join('');

  listMount.querySelectorAll('[data-del-sess]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await db.delete('sessions', btn.dataset.delSess);
      await refreshAllViews();
      showToast('Session deleted');
    });
  });
}

// ============================================================================
// SHEET MODAL CONTROLLER
// ============================================================================
function openSheet(html, onMount) {
  const backdrop = document.getElementById('sheetBackdrop');
  const content = document.getElementById('sheetContent');
  content.innerHTML = html;
  backdrop.classList.remove('hidden');
  if (onMount) onMount(content);
}

function closeSheet() {
  stopLivePracticeTimer();
  audioRecorder.cleanup();
  document.getElementById('sheetBackdrop').classList.add('hidden');
  document.getElementById('sheetContent').innerHTML = '';
}

function stopLivePracticeTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  state.timerRunning = false;
  state.timerSeconds = 0;
}

// ============================================================================
// QUICK CAPTURE SHEET (SESSION + MILESTONE WITH PHOTO / VIDEO / AUDIO + GDRIVE)
// ============================================================================
function openCaptureSheet({ mode = 'session', hobbyId = null } = {}) {
  let currentMode = mode;
  let selectedHobbyId = hobbyId || state.hobbies[0]?.id;
  let selectedMinutes = 30;
  let stagedMediaBlob = null;
  let stagedMediaType = null; // 'image' | 'video' | 'audio'
  let stagedMediaMime = null;
  let stagedPreviewUrl = null;
  let selectedRating = 0;
  let isRecordingMic = false;
  let micSeconds = 0;
  let micTimer = null;

  function renderCaptureInner(root) {
    const hobby = state.hobbies.find((h) => h.id === selectedHobbyId) || state.hobbies[0];
    const hasCounter =
      hobby && ['visual', 'collection', 'cumulative', 'rhythm'].includes(hobby.archetype) && hobby.progressUnit;
    const defaultBump = hobby?.archetype === 'cumulative' ? 5 : 1;
    const driveReady = gdrive.isConfigured() && gdrive.isAutoSyncEnabled();

    root.innerHTML = `
      <div class="sheet-header">
        <h3 class="sheet-title">${currentMode === 'session' ? 'Log Practice Session' : 'Capture Milestone'}</h3>
        <button class="icon-btn" type="button" id="btnSheetClose" aria-label="Close">✕</button>
      </div>

      <div class="segmented-tabs">
        <button class="seg-btn ${currentMode === 'session' ? 'active' : ''}" data-mode="session" type="button">⏱ Quick Session</button>
        <button class="seg-btn ${currentMode === 'milestone' ? 'active' : ''}" data-mode="milestone" type="button">✦ Milestone / Media</button>
      </div>

      <div class="field-group">
        <label class="field-label">Hobby</label>
        <div class="hobby-selector-grid">
          ${state.hobbies
            .map(
              (h) => `
            <button
              class="hobby-pick-pill ${h.id === selectedHobbyId ? 'selected' : ''}"
              data-pick-hobby="${h.id}"
              type="button"
            >
              <span>${h.icon}</span>
              <span>${escapeHtml(h.name)}</span>
            </button>`
            )
            .join('')}
        </div>
      </div>

      ${
        currentMode === 'session'
          ? `
        <div class="field-group">
          <label class="field-label">Time Spent</label>
          <div class="duration-chips">
            ${[15, 30, 45, 60, 90]
              .map(
                (m) => `
              <button class="dur-chip ${selectedMinutes === m ? 'selected' : ''}" data-dur="${m}" type="button">${m}m</button>
            `
              )
              .join('')}
            <input
              type="number"
              id="inpCustomMinutes"
              class="text-input"
              style="width:82px;padding:6px 10px;border-radius:999px;text-align:center;"
              min="1"
              max="600"
              value="${selectedMinutes}"
              aria-label="Minutes"
            />
          </div>

          <div class="timer-bar">
            <div>
              <span style="font-size:11px;color:var(--ink-muted);display:block;">Live Practice Stopwatch</span>
              <span class="timer-readout" id="liveTimerDisplay">00:00</span>
            </div>
            <button class="secondary-btn" type="button" id="btnToggleStopwatch">Start Timer</button>
          </div>
        </div>

        ${
          hasCounter
            ? `
          <div class="field-group">
            <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;cursor:pointer;">
              <input type="checkbox" id="chkBumpProgress" style="width:16px;height:16px;" />
              <span>Also add <strong>+${defaultBump} ${escapeHtml(hobby.progressUnit)}</strong> to ${escapeHtml(hobby.name)} (${hobby.progressCurrent || 0}/${hobby.progressTarget || 0})</span>
            </label>
          </div>`
            : ''
        }

        <div class="field-group">
          <label class="field-label" for="inpSessionNote">Quick Note (Optional)</label>
          <textarea
            id="inpSessionNote"
            class="text-area"
            placeholder="What did you work on or notice today?"
          ></textarea>
        </div>

        <button class="full-submit-btn" id="btnSaveSession" type="button">Save ${escapeHtml(hobby?.name || '')} Session</button>
      `
          : `
        <div class="field-group">
          <label class="field-label" for="inpMsTitle">Milestone Headline</label>
          <input
            id="inpMsTitle"
            class="text-input"
            type="text"
            placeholder="${
              hobby?.id === 'hobby_cooking'
                ? 'e.g., Hand-pulled Biang Biang Noodles'
                : hobby?.id === 'hobby_drawing'
                ? 'e.g., Finished Ink Perspective Study'
                : hobby?.id === 'hobby_piano'
                ? 'e.g., Clair de Lune Full Playthrough'
                : hobby?.id === 'hobby_workout'
                ? 'e.g., 225 lb Squat Form Check'
                : 'e.g., 2-Minute Mandarin Monologue'
            }"
          />
        </div>

        <div class="field-group">
          <label class="field-label">Photo, Video, or Audio Attachment</label>
          <div class="upload-grid-3">
            <label class="upload-box-btn">
              <span style="font-size:19px;">📷</span>
              <span>Photo</span>
              <input type="file" id="inpPhotoFile" accept="image/*" class="hidden" />
            </label>
            <label class="upload-box-btn">
              <span style="font-size:19px;">🎬</span>
              <span>Video</span>
              <input type="file" id="inpVideoFile" accept="video/*" class="hidden" />
            </label>
            <button class="upload-box-btn" id="btnRecordAudio" type="button">
              <span style="font-size:19px;">🎙</span>
              <span id="lblRecordAudio">Record Mic</span>
            </button>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:11.5px;color:var(--ink-muted);">
            <span>${
              driveReady
                ? `☁️ Auto-uploads to Drive: <strong>Folio / ${escapeHtml(hobby?.name || 'Hobby')}</strong>`
                : `📁 Saves to <strong>Folio / ${escapeHtml(hobby?.name || 'Hobby')}</strong> (<button type="button" id="btnSetupDriveInline" class="text-link-btn" style="font-size:11.5px;text-decoration:underline;">connect Google Drive</button>)`
            }</span>
            <label style="cursor:pointer;text-decoration:underline;">
              + Audio file
              <input type="file" id="inpAudioFile" accept="audio/*" class="hidden" />
            </label>
          </div>
          <div id="mediaStagingArea"></div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;" class="field-group">
          <div>
            <label class="field-label" for="inpMsBadge">Badge / PR Tag</label>
            <input id="inpMsBadge" class="text-input" type="text" placeholder="e.g., New PR, Dish #13" />
          </div>
          <div>
            <label class="field-label">Rating (Optional)</label>
            <div id="starPicker" style="display:flex;gap:5px;padding-top:6px;font-size:21px;cursor:pointer;color:#C78426;">
              ${[1, 2, 3, 4, 5]
                .map((n) => `<span data-star="${n}">${n <= selectedRating ? '★' : '☆'}</span>`)
                .join('')}
            </div>
          </div>
        </div>

        <div class="field-group">
          <label class="field-label" for="inpMsNote">Reflection / Recipe / Notes</label>
          <textarea id="inpMsNote" class="text-area" placeholder="Capture how it went or what clicked..."></textarea>
        </div>

        <button class="full-submit-btn" id="btnSaveMilestone" type="button">
          ${driveReady ? '✦ Save & Upload to Google Drive' : '✦ Save to Milestone Vault'}
        </button>
      `
      }
    `;

    root.querySelector('#btnSheetClose').addEventListener('click', closeSheet);
    root.querySelectorAll('[data-mode]').forEach((b) => {
      b.addEventListener('click', () => {
        stopLivePracticeTimer();
        currentMode = b.dataset.mode;
        renderCaptureInner(root);
      });
    });

    root.querySelectorAll('[data-pick-hobby]').forEach((b) => {
      b.addEventListener('click', () => {
        selectedHobbyId = b.dataset.pickHobby;
        renderCaptureInner(root);
      });
    });

    if (currentMode === 'session') {
      const inpCustom = root.querySelector('#inpCustomMinutes');
      root.querySelectorAll('[data-dur]').forEach((chip) => {
        chip.addEventListener('click', () => {
          selectedMinutes = Number(chip.dataset.dur);
          inpCustom.value = selectedMinutes;
          root.querySelectorAll('[data-dur]').forEach((c) => c.classList.toggle('selected', c === chip));
        });
      });
      inpCustom.addEventListener('input', () => {
        selectedMinutes = Math.max(1, Number(inpCustom.value) || 15);
        root.querySelectorAll('[data-dur]').forEach((c) =>
          c.classList.toggle('selected', Number(c.dataset.dur) === selectedMinutes)
        );
      });

      const timerDisplay = root.querySelector('#liveTimerDisplay');
      const btnToggleSw = root.querySelector('#btnToggleStopwatch');
      btnToggleSw.addEventListener('click', () => {
        if (!state.timerRunning) {
          state.timerRunning = true;
          btnToggleSw.textContent = 'Use Elapsed';
          state.timerInterval = setInterval(() => {
            state.timerSeconds++;
            const mm = String(Math.floor(state.timerSeconds / 60)).padStart(2, '0');
            const ss = String(state.timerSeconds % 60).padStart(2, '0');
            timerDisplay.textContent = `${mm}:${ss}`;
          }, 1000);
        } else {
          const elapsedMins = Math.max(1, Math.round(state.timerSeconds / 60));
          selectedMinutes = elapsedMins;
          inpCustom.value = elapsedMins;
          clearInterval(state.timerInterval);
          state.timerRunning = false;
          btnToggleSw.textContent = 'Resume';
          showToast(`Applied ${elapsedMins}m from timer`);
        }
      });

      root.querySelector('#btnSaveSession').addEventListener('click', async () => {
        const mins = Math.max(1, Number(inpCustom.value) || selectedMinutes);
        const note = root.querySelector('#inpSessionNote').value.trim();
        const bumpChecked = root.querySelector('#chkBumpProgress')?.checked;

        await db.put('sessions', {
          id: 'sess_' + Date.now(),
          hobbyId: selectedHobbyId,
          minutes: mins,
          note,
          timestamp: Date.now()
        });

        if (bumpChecked && hobby) {
          hobby.progressCurrent = (Number(hobby.progressCurrent) || 0) + defaultBump;
          await db.put('hobbies', hobby);
        }

        closeSheet();
        await refreshAllViews();
        showToast(`Logged ${formatDuration(mins)} for ${hobby?.name}`);
      });
    } else {
      const stagingArea = root.querySelector('#mediaStagingArea');

      root.querySelector('#btnSetupDriveInline')?.addEventListener('click', () => {
        openSettingsSheet({ focusDrive: true });
      });

      const updateStagingPreview = () => {
        if (!stagedMediaBlob) {
          stagingArea.innerHTML = '';
          return;
        }
        if (stagedMediaType === 'image') {
          stagingArea.innerHTML = `
            <div class="media-preview-staging">
              <img src="${stagedPreviewUrl}" alt="Selected photo preview" />
            </div>
          `;
        } else if (stagedMediaType === 'video') {
          stagingArea.innerHTML = `
            <div class="media-preview-staging">
              <video src="${stagedPreviewUrl}" controls playsinline></video>
            </div>
          `;
        } else if (stagedMediaType === 'audio') {
          stagingArea.innerHTML = `
            <div class="audio-clip-box" style="margin-top:10px;">
              <span>🎙</span>
              <audio controls src="${stagedPreviewUrl}" style="height:32px;flex:1;"></audio>
            </div>
          `;
        }
      };
      updateStagingPreview();

      // Photo picker
      root.querySelector('#inpPhotoFile').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const compressed = await compressImageFile(file);
          stagedMediaBlob = compressed;
          stagedMediaType = 'image';
          stagedMediaMime = 'image/jpeg';
          stagedPreviewUrl =
            typeof compressed === 'string' ? compressed : URL.createObjectURL(compressed);
          updateStagingPreview();
        } catch {
          showToast('Could not process photo');
        }
      });

      // Video picker
      root.querySelector('#inpVideoFile').addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        stagedMediaBlob = file;
        stagedMediaType = 'video';
        stagedMediaMime = file.type || 'video/mp4';
        stagedPreviewUrl = URL.createObjectURL(file);
        updateStagingPreview();
      });

      // Audio file picker
      root.querySelector('#inpAudioFile').addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        stagedMediaBlob = file;
        stagedMediaType = 'audio';
        stagedMediaMime = file.type || 'audio/mp4';
        stagedPreviewUrl = URL.createObjectURL(file);
        updateStagingPreview();
      });

      // In-app microphone recorder
      const btnRec = root.querySelector('#btnRecordAudio');
      const lblRec = root.querySelector('#lblRecordAudio');
      btnRec.addEventListener('click', async () => {
        if (!audioRecorder.isSupported()) {
          showToast('Microphone recording not supported in this browser');
          return;
        }
        if (!isRecordingMic) {
          try {
            await audioRecorder.start();
            isRecordingMic = true;
            micSeconds = 0;
            btnRec.classList.add('recording');
            lblRec.textContent = `Stop (${micSeconds}s)`;
            micTimer = setInterval(() => {
              micSeconds++;
              lblRec.textContent = `Stop (${micSeconds}s)`;
            }, 1000);
          } catch {
            showToast('Microphone permission denied');
          }
        } else {
          clearInterval(micTimer);
          isRecordingMic = false;
          btnRec.classList.remove('recording');
          lblRec.textContent = 'Record Mic';
          const result = await audioRecorder.stop();
          if (result && result.blob) {
            stagedMediaBlob = result.blob;
            stagedMediaType = 'audio';
            stagedMediaMime = result.mime || 'audio/webm';
            stagedPreviewUrl = URL.createObjectURL(result.blob);
            updateStagingPreview();
          }
        }
      });

      root.querySelectorAll('[data-star]').forEach((starEl) => {
        starEl.addEventListener('click', () => {
          const val = Number(starEl.dataset.star);
          selectedRating = selectedRating === val ? 0 : val;
          root.querySelectorAll('[data-star]').forEach((s) => {
            s.textContent = Number(s.dataset.star) <= selectedRating ? '★' : '☆';
          });
        });
      });

      root.querySelector('#btnSaveMilestone').addEventListener('click', async () => {
        const title = root.querySelector('#inpMsTitle').value.trim();
        if (!title) {
          root.querySelector('#inpMsTitle').focus();
          showToast('Please add a headline for your milestone');
          return;
        }
        const badge = root.querySelector('#inpMsBadge').value.trim();
        const note = root.querySelector('#inpMsNote').value.trim();
        const saveBtn = root.querySelector('#btnSaveMilestone');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        let mediaId = null;
        if (stagedMediaBlob) {
          mediaId = await db.saveMedia(stagedMediaBlob, stagedMediaMime || 'application/octet-stream');
          if ((stagedMediaType === 'image' || stagedMediaType === 'video') && hobby) {
            hobby.coverMediaId = mediaId;
            hobby.coverMediaType = stagedMediaType;
            await db.put('hobbies', hobby);
          }
        }

        const newMilestone = {
          id: 'ms_' + Date.now(),
          hobbyId: selectedHobbyId,
          title,
          badge,
          note,
          rating: selectedRating || null,
          mediaId,
          mediaType: stagedMediaType,
          timestamp: Date.now()
        };

        await db.put('milestones', newMilestone);

        // Mirror locally into folio/Folio/<Hobby Name>/ on disk if running local server.py
        if (stagedMediaBlob) {
          mirrorMediaLocally({
            milestone: newMilestone,
            hobbyName: hobby?.name || 'General',
            blobOrDataUrl: stagedMediaBlob,
            mimeType: stagedMediaMime
          });
        }

        closeSheet();
        await refreshAllViews();

        // Auto-upload to Google Drive -> Folio / <Hobby Name> / ... if enabled!
        if (stagedMediaBlob && gdrive.isConfigured() && gdrive.isAutoSyncEnabled()) {
          await syncSingleMilestoneToDrive(newMilestone.id, { interactive: true });
        } else {
          showToast(`✦ Milestone added to ${hobby?.name}`);
        }
      });
    }
  }

  openSheet('', renderCaptureInner);
}

// ============================================================================
// HOBBY DETAIL & FOCUS EDITOR SHEET
// ============================================================================
function openHobbyDetailSheet(hobbyId) {
  const renderDetail = (root) => {
    const hobby = state.hobbies.find((h) => h.id === hobbyId);
    if (!hobby) return;

    const hobbySessions = state.sessions.filter((s) => s.hobbyId === hobby.id);
    const totalMins = hobbySessions.reduce((acc, s) => acc + (Number(s.minutes) || 0), 0);
    const hobbyMilestones = state.milestones.filter((m) => m.hobbyId === hobby.id);
    const folderLink = hobby.driveFolderLink || gdrive.getHobbyFolderLink(hobby.name);

    const isPipeline = hobby.archetype === 'pipeline';
    const hasCounter =
      ['visual', 'collection', 'cumulative', 'rhythm'].includes(hobby.archetype) && hobby.progressTarget;

    root.innerHTML = `
      <div class="sheet-header">
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="hobby-icon-chip" style="background:${hobby.tint};width:38px;height:38px;font-size:20px;">${hobby.icon}</span>
          <div>
            <h3 class="sheet-title">${escapeHtml(hobby.name)}</h3>
            <span style="font-size:12px;color:var(--ink-muted);">${formatDuration(totalMins)} total logged · Target ${hobby.weeklyTarget}x/wk</span>
          </div>
        </div>
        <button class="icon-btn" type="button" id="btnCloseDetail" aria-label="Close">✕</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <button class="primary-pill-btn" id="btnDetailLogSess" type="button">+ Log Session</button>
        <button class="secondary-btn" id="btnDetailAddMs" type="button">✦ Add Milestone</button>
      </div>

      ${
        folderLink
          ? `<div style="margin-bottom:14px;">
              <a class="drive-link-chip" href="${escapeHtml(folderLink)}" target="_blank" rel="noopener">
                📁 Open Folio / ${escapeHtml(hobby.name)} in Google Drive ↗
              </a>
            </div>`
          : ''
      }

      <div class="detail-focus-box">
        <span class="eyebrow" style="color:${hobby.accent};">CURRENTLY IN PROGRESS</span>
        <div class="field-group" style="margin-top:8px;margin-bottom:10px;">
          <label class="field-label" for="inpFocusTitle">Active Focus / Piece / Goal</label>
          <input id="inpFocusTitle" class="text-input" type="text" value="${escapeHtml(hobby.activeTitle || '')}" />
        </div>
        <div class="field-group" style="margin-bottom:10px;">
          <label class="field-label" for="inpFocusSub">Notes / Tempo / Current PRs</label>
          <input id="inpFocusSub" class="text-input" type="text" value="${escapeHtml(hobby.activeSubtitle || '')}" />
        </div>

        ${
          isPipeline
            ? `
          <div>
            <span class="field-label">Current Stage (Tap to advance)</span>
            <div class="stage-pill-selector">
              ${(hobby.stages || ['Notes', 'Hands Together', 'Up to Tempo', 'Polished'])
                .map(
                  (st, idx) => `
                <button
                  class="stage-select-btn ${idx === hobby.stageIndex ? 'active' : ''}"
                  data-set-stage="${idx}"
                  type="button"
                >${idx + 1}. ${escapeHtml(st)}</button>`
                )
                .join('')}
            </div>
          </div>`
            : ''
        }

        ${
          hasCounter
            ? `
          <div style="margin-top:10px;">
            <span class="field-label">Progress Counter (${escapeHtml(hobby.progressUnit || 'units')})</span>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
              <div class="counter-stepper">
                <button class="step-btn" data-step="-1" type="button">−</button>
                <strong style="font-size:16px;min-width:78px;text-align:center;">${hobby.progressCurrent || 0} / ${hobby.progressTarget}</strong>
                <button class="step-btn" data-step="1" type="button">+</button>
                <button class="secondary-btn" data-step="5" type="button" style="padding:5px 10px;font-size:12px;">+5</button>
              </div>
              <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-muted);">
                <span>Target:</span>
                <input id="inpTargetNum" type="number" class="text-input" style="width:72px;padding:5px 8px;" value="${hobby.progressTarget}" />
              </div>
            </div>
          </div>`
            : ''
        }

        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:12px;border-top:1px solid var(--border-hairline);">
          <div style="display:flex;align-items:center;gap:6px;font-size:12.5px;">
            <span>Weekly rhythm goal:</span>
            <input id="inpWeeklyTarget" type="number" min="1" max="7" class="text-input" style="width:54px;padding:4px 8px;text-align:center;" value="${hobby.weeklyTarget || 3}" />
            <span>/ wk</span>
          </div>
          <button class="secondary-btn" id="btnSaveHobbyFocus" type="button">Save Changes</button>
        </div>
      </div>

      ${
        hobbyMilestones.length > 0
          ? `
        <div style="margin-bottom:14px;">
          <span class="field-label">${escapeHtml(hobby.name)} Milestones (${hobbyMilestones.length})</span>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${hobbyMilestones
              .slice(0, 4)
              .map(
                (m) => `
              <div class="journal-item" style="padding:10px 12px;">
                <div>
                  <strong style="font-size:13.5px;">✦ ${escapeHtml(m.title)}</strong>
                  ${m.note ? `<p class="journal-note" style="font-size:12px;">${escapeHtml(m.note)}</p>` : ''}
                </div>
                <span style="font-size:11px;color:var(--ink-muted);white-space:nowrap;">${
                  m.driveWebViewLink ? '☁️ ' : ''
                }${formatRelativeDate(m.timestamp)}</span>
              </div>`
              )
              .join('')}
          </div>
        </div>`
          : ''
      }

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
        <button class="danger-btn" id="btnDeleteHobby" type="button" style="font-size:12px;padding:6px 12px;">Remove Hobby</button>
        <span style="font-size:12px;color:var(--ink-muted);">${hobbySessions.length} sessions logged</span>
      </div>
    `;

    root.querySelector('#btnCloseDetail').addEventListener('click', closeSheet);
    root.querySelector('#btnDetailLogSess').addEventListener('click', () => {
      openCaptureSheet({ mode: 'session', hobbyId: hobby.id });
    });
    root.querySelector('#btnDetailAddMs').addEventListener('click', () => {
      openCaptureSheet({ mode: 'milestone', hobbyId: hobby.id });
    });

    root.querySelectorAll('[data-set-stage]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        hobby.stageIndex = Number(btn.dataset.setStage);
        await db.put('hobbies', hobby);
        await refreshAllViews();
        renderDetail(root);
        showToast(`Stage updated: ${hobby.stages[hobby.stageIndex]}`);
      });
    });

    root.querySelectorAll('[data-step]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const delta = Number(btn.dataset.step);
        hobby.progressCurrent = Math.max(0, (Number(hobby.progressCurrent) || 0) + delta);
        await db.put('hobbies', hobby);
        await refreshAllViews();
        renderDetail(root);
      });
    });

    root.querySelector('#btnSaveHobbyFocus').addEventListener('click', async () => {
      hobby.activeTitle = root.querySelector('#inpFocusTitle').value.trim();
      hobby.activeSubtitle = root.querySelector('#inpFocusSub').value.trim();
      hobby.weeklyTarget = Math.min(7, Math.max(1, Number(root.querySelector('#inpWeeklyTarget').value) || 3));
      const inpTarget = root.querySelector('#inpTargetNum');
      if (inpTarget) {
        hobby.progressTarget = Math.max(1, Number(inpTarget.value) || 10);
      }
      await db.put('hobbies', hobby);
      await refreshAllViews();
      closeSheet();
      showToast(`${hobby.name} focus updated`);
    });

    root.querySelector('#btnDeleteHobby').addEventListener('click', async () => {
      if (state.hobbies.length <= 1) {
        showToast('Keep at least one hobby on your Bento board');
        return;
      }
      await db.delete('hobbies', hobby.id);
      closeSheet();
      await refreshAllViews();
      showToast(`${hobby.name} removed`);
    });
  };

  openSheet('', renderDetail);
}

// ============================================================================
// ADD NEW HOBBY SHEET
// ============================================================================
function openAddHobbySheet() {
  let pickedPalette = PALETTES[0];
  let pickedArchetype = 'pipeline';

  openSheet('', (root) => {
    const render = () => {
      root.innerHTML = `
        <div class="sheet-header">
          <h3 class="sheet-title">Add Hobby to Folio</h3>
          <button class="icon-btn" type="button" id="btnCloseNewHobby">✕</button>
        </div>

        <div style="display:grid;grid-template-columns:74px 1fr;gap:10px;" class="field-group">
          <div>
            <label class="field-label" for="inpNewIcon">Icon</label>
            <input id="inpNewIcon" class="text-input" type="text" value="🎸" style="text-align:center;font-size:20px;" />
          </div>
          <div>
            <label class="field-label" for="inpNewName">Hobby Name</label>
            <input id="inpNewName" class="text-input" type="text" placeholder="e.g., Guitar, Pottery, Running" />
          </div>
        </div>

        <div class="field-group">
          <label class="field-label">Progress Nature (Card Archetype)</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;">
            ${[
              ['pipeline', '🎹 Stage Pipeline', 'Pieces or projects moving through stages'],
              ['visual', '✏️ Visual Study', 'Photo/video preview + study count bar'],
              ['collection', '🍳 Collection', 'Repertoire of dishes/creations'],
              ['rhythm', '🏋️ Weekly Rhythm', 'Consistency blocks & PRs'],
              ['cumulative', '🏮 Cumulative Tier', 'Vocab, pages, or hours meter']
            ]
              .map(
                ([key, title, desc]) => `
              <button
                type="button"
                data-arch="${key}"
                style="text-align:left;padding:10px;border-radius:12px;border:1.5px solid ${
                  pickedArchetype === key ? 'var(--ink)' : 'var(--border-hairline)'
                };background:var(--bg-card);cursor:pointer;"
              >
                <div style="font-weight:650;font-size:13px;">${title}</div>
                <div style="font-size:11px;color:var(--ink-muted);margin-top:2px;">${desc}</div>
              </button>`
              )
              .join('')}
          </div>
        </div>

        <div class="field-group">
          <label class="field-label" for="inpNewFocus">Initial Active Focus</label>
          <input id="inpNewFocus" class="text-input" type="text" placeholder="What are you working on right now?" />
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;" class="field-group">
          <div>
            <label class="field-label" for="inpNewWeekly">Weekly Rhythm Target</label>
            <input id="inpNewWeekly" class="text-input" type="number" min="1" max="7" value="3" />
          </div>
          <div>
            <label class="field-label">Editorial Accent</label>
            <div style="display:flex;gap:8px;padding-top:6px;">
              ${PALETTES.map(
                (p) => `
                <button
                  type="button"
                  data-pal="${p.accent}"
                  style="width:26px;height:26px;border-radius:50%;background:${p.accent};border:${
                  pickedPalette.accent === p.accent ? '3px solid var(--ink)' : '1px solid transparent'
                };cursor:pointer;"
                  aria-label="${p.name}"
                ></button>`
              ).join('')}
            </div>
          </div>
        </div>

        <button class="full-submit-btn" id="btnCreateHobby" type="button">Add to Bento Grid</button>
      `;

      root.querySelector('#btnCloseNewHobby').addEventListener('click', closeSheet);
      root.querySelectorAll('[data-arch]').forEach((b) => {
        b.addEventListener('click', () => {
          pickedArchetype = b.dataset.arch;
          render();
        });
      });
      root.querySelectorAll('[data-pal]').forEach((b) => {
        b.addEventListener('click', () => {
          pickedPalette = PALETTES.find((p) => p.accent === b.dataset.pal) || PALETTES[0];
          render();
        });
      });

      root.querySelector('#btnCreateHobby').addEventListener('click', async () => {
        const name = root.querySelector('#inpNewName').value.trim();
        if (!name) {
          root.querySelector('#inpNewName').focus();
          return;
        }
        const icon = root.querySelector('#inpNewIcon').value.trim() || '✦';
        const activeTitle = root.querySelector('#inpNewFocus').value.trim() || `Exploring ${name}`;
        const weeklyTarget = Math.min(7, Math.max(1, Number(root.querySelector('#inpNewWeekly').value) || 3));

        const newHobby = {
          id: 'hobby_' + Date.now(),
          name,
          icon,
          archetype: pickedArchetype,
          span: pickedArchetype === 'pipeline' ? 'wide' : 'normal',
          accent: pickedPalette.accent,
          tint: pickedPalette.tint,
          weeklyTarget,
          activeTitle,
          activeSubtitle: '',
          stages: ['Started', 'Practicing', 'Refining', 'Polished'],
          stageIndex: 0,
          progressCurrent: 0,
          progressTarget: 20,
          progressUnit: 'items',
          order: state.hobbies.length + 1
        };

        await db.put('hobbies', newHobby);
        closeSheet();
        await refreshAllViews();
        showToast(`${name} added to your Folio`);
      });
    };
    render();
  });
}

// ============================================================================
// GOOGLE DRIVE & SETTINGS SHEET
// ============================================================================
function openSettingsSheet({ focusDrive = false } = {}) {
  openSheet('', (root) => {
    const render = () => {
      const clientId = gdrive.getClientId();
      const connected = gdrive.hasActiveToken();
      const autoSync = gdrive.isAutoSyncEnabled();
      const rootLink = gdrive.getRootFolderLink();
      const unsyncedMediaMilestones = state.milestones.filter((m) => m.mediaId && !m.driveFileId);
      const hobbyNamesSample = state.hobbies
        .slice(0, 4)
        .map((h) => `  ├── 📁 ${escapeHtml(h.name)}/`)
        .join('\n');

      root.innerHTML = `
        <div class="sheet-header">
          <h3 class="sheet-title">Google Drive &amp; Settings</h3>
          <button class="icon-btn" type="button" id="btnCloseSettings">✕</button>
        </div>

        <div class="drive-config-box">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <span class="eyebrow" style="color:#2E5A88;margin:0;">GOOGLE DRIVE AUTO-UPLOAD</span>
            <span style="font-size:11.5px;font-weight:650;color:${connected ? '#2F855A' : 'var(--ink-muted)'};">
              ${connected ? '● Connected' : clientId ? '● Ready to Sign In' : 'Not Connected'}
            </span>
          </div>

          <p style="font-size:13px;color:var(--ink-secondary);margin:6px 0 8px;">
            Automatically uploads milestone photos, videos, and audio clips into organized per-hobby folders in your Google Drive, plus maintains a master index spreadsheet:
          </p>

          <pre class="folder-tree-preview">📁 Folio/ (Parent Folder)
  ├── 📄 Folio_Milestones_Index.csv
${hobbyNamesSample}</pre>

          <div class="field-group" style="margin-bottom:10px;">
            <label class="field-label" for="inpDriveClientId">Google OAuth Web Client ID</label>
            <input
              id="inpDriveClientId"
              class="text-input"
              type="text"
              placeholder="123456789-abc...apps.googleusercontent.com"
              value="${escapeHtml(clientId)}"
            />
            <details style="margin-top:6px;font-size:11.5px;color:var(--ink-muted);">
              <summary style="cursor:pointer;font-weight:600;">How to get a free Client ID (1 min)</summary>
              <ol style="margin:6px 0 0;padding-left:18px;line-height:1.5;">
                <li>In Google Cloud Console, enable the <strong>Google Drive API</strong>.</li>
                <li>Create an <strong>OAuth 2.0 Client ID</strong> (type: <em>Web application</em>).</li>
                <li>Add <code>${escapeHtml(window.location.origin)}</code> under <strong>Authorized JavaScript origins</strong>, then paste the Client ID above.</li>
              </ol>
            </details>
          </div>

          <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:12px;cursor:pointer;">
            <input type="checkbox" id="chkDriveAutoSync" ${autoSync ? 'checked' : ''} style="width:16px;height:16px;" />
            <span>Auto-upload media when saving a new milestone</span>
          </label>

          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            <button class="primary-pill-btn" id="btnConnectDrive" type="button">
              ${connected ? 'Create / Verify Folio Folders' : '☁️ Save & Connect Google Drive'}
            </button>

            ${
              unsyncedMediaMilestones.length > 0 && clientId
                ? `<button class="secondary-btn" id="btnSyncPending" type="button">
                    Sync ${unsyncedMediaMilestones.length} Unsynced Media
                  </button>`
                : ''
            }

            ${
              rootLink
                ? `<a class="drive-link-chip" href="${escapeHtml(rootLink)}" target="_blank" rel="noopener" style="padding:8px 12px;">
                    Open Folio Folder ↗
                  </a>`
                : ''
            }

            ${
              connected
                ? `<button class="text-link-btn" id="btnDisconnectDrive" type="button" style="margin-left:auto;font-size:12px;">Disconnect</button>`
                : ''
            }
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;">
          <button class="secondary-btn" id="btnClearSamples" type="button" style="text-align:left;padding:12px 15px;">
            <strong>Start Fresh (Clear Sample Entries)</strong>
            <span style="display:block;font-size:12px;color:var(--ink-muted);font-weight:400;margin-top:2px;">
              Keeps Piano, Drawing, Cooking, Working Out &amp; Chinese configured, and removes demo logs.
            </span>
          </button>

          <button class="secondary-btn" id="btnExportJson" type="button" style="text-align:left;padding:12px 15px;">
            <strong>Export JSON Backup</strong>
            <span style="display:block;font-size:12px;color:var(--ink-muted);font-weight:400;margin-top:2px;">
              Download your hobbies, sessions, and milestone metadata.
            </span>
          </button>

          <button class="danger-btn" id="btnResetDemo" type="button" style="text-align:left;padding:12px 15px;">
            <strong>Reset Everything to Demo Defaults</strong>
            <span style="display:block;font-size:12px;opacity:0.8;font-weight:400;margin-top:2px;">
              Restores the initial showcase seed data.
            </span>
          </button>
        </div>
      `;

      if (focusDrive && !clientId) {
        setTimeout(() => root.querySelector('#inpDriveClientId')?.focus(), 60);
      }

      root.querySelector('#btnCloseSettings').addEventListener('click', closeSheet);

      root.querySelector('#chkDriveAutoSync').addEventListener('change', (e) => {
        gdrive.setAutoSyncEnabled(e.target.checked);
      });

      root.querySelector('#btnConnectDrive').addEventListener('click', async () => {
        const entered = root.querySelector('#inpDriveClientId').value.trim();
        if (!entered) {
          root.querySelector('#inpDriveClientId').focus();
          showToast('Paste your Google OAuth Client ID first');
          return;
        }
        gdrive.setClientId(entered);
        renderDriveHeaderBadge();

        try {
          const btn = root.querySelector('#btnConnectDrive');
          btn.disabled = true;
          btn.textContent = 'Connecting...';
          const token = await gdrive.ensureAccessToken({ interactive: true });

          // Pre-create Folio parent folder + subfolders for every current hobby!
          for (const h of state.hobbies) {
            const { hobbyFolder } = await gdrive.ensureHobbyFolder(h.name, token);
            if (hobbyFolder.webViewLink) {
              h.driveFolderLink = hobbyFolder.webViewLink;
              await db.put('hobbies', h);
            }
          }
          await gdrive.syncMilestonesIndexCsv(state.milestones, state.hobbies);

          renderDriveHeaderBadge();
          render();
          showToast('☁️ Connected! Created Folio & hobby folders in Google Drive');
        } catch (err) {
          render();
          showToast(`Google Sign-In error: ${err.message}`, 3600);
        }
      });

      root.querySelector('#btnSyncPending')?.addEventListener('click', async () => {
        const btn = root.querySelector('#btnSyncPending');
        btn.disabled = true;
        btn.textContent = 'Uploading...';
        let count = 0;
        for (const m of unsyncedMediaMilestones) {
          const ok = await syncSingleMilestoneToDrive(m.id, { interactive: count === 0 });
          if (ok) count++;
        }
        render();
        showToast(`Synced ${count} media milestone(s) to Google Drive`);
      });

      root.querySelector('#btnDisconnectDrive')?.addEventListener('click', () => {
        gdrive.disconnect();
        renderDriveHeaderBadge();
        render();
        showToast('Disconnected Google Drive session');
      });

      root.querySelector('#btnClearSamples').addEventListener('click', async () => {
        await clearSampleEntriesOnly();
        state.mediaUrls.clear();
        closeSheet();
        await refreshAllViews();
        showToast('Sample entries cleared — ready for your sessions!');
      });

      root.querySelector('#btnExportJson').addEventListener('click', async () => {
        const payload = {
          exportedAt: new Date().toISOString(),
          hobbies: state.hobbies,
          sessions: state.sessions,
          milestones: state.milestones
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `folio-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Backup exported');
      });

      root.querySelector('#btnResetDemo').addEventListener('click', async () => {
        await Promise.all([
          db.clear('hobbies'),
          db.clear('sessions'),
          db.clear('milestones'),
          db.clear('media')
        ]);
        state.mediaUrls.clear();
        await ensureInitialData();
        closeSheet();
        await refreshAllViews();
        showToast('Restored showcase data');
      });
    };

    render();
  });
}

// ============================================================================
// LIGHTBOX & NAVIGATION WIRING
// ============================================================================
function openLightbox(src, caption = '') {
  const overlay = document.getElementById('lightboxOverlay');
  document.getElementById('lightboxImage').src = src;
  document.getElementById('lightboxCaption').textContent = caption;
  overlay.classList.remove('hidden');
}

function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.tab-view').forEach((sec) => {
    sec.classList.toggle('active', sec.id === `view-${tabName}`);
  });
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  window.scrollTo(0, 0);
}

async function refreshAllViews() {
  await loadAllData();
  renderDriveHeaderBadge();
  renderWeeklyPulse();
  renderBentoGrid();
  renderRecentMilestonesStrip();
  renderMilestonesVault();
  renderJournalView();
}

async function init() {
  renderHeaderDate();
  await ensureInitialData();
  await refreshAllViews();

  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('btnOpenQuickCapture').addEventListener('click', () => {
    openCaptureSheet({
      mode: state.activeTab === 'milestones' ? 'milestone' : 'session'
    });
  });

  document.getElementById('btnNewMilestoneTop').addEventListener('click', () => {
    openCaptureSheet({
      mode: 'milestone',
      hobbyId: state.milestoneFilter !== 'all' ? state.milestoneFilter : state.hobbies[0]?.id
    });
  });

  document.getElementById('btnSeeAllMilestones').addEventListener('click', () => {
    switchTab('milestones');
  });

  document.getElementById('btnDriveStatus').addEventListener('click', () => {
    openSettingsSheet({ focusDrive: true });
  });

  document.getElementById('btnAddHobby').addEventListener('click', openAddHobbySheet);
  document.getElementById('btnSettings').addEventListener('click', () => openSettingsSheet());

  document.getElementById('sheetBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'sheetBackdrop') closeSheet();
  });

  document.getElementById('btnCloseLightbox').addEventListener('click', () => {
    document.getElementById('lightboxOverlay').classList.add('hidden');
  });
  document.getElementById('lightboxOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'lightboxOverlay') {
      document.getElementById('lightboxOverlay').classList.add('hidden');
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

init();
