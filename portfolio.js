// SimonXP — Retro Windows XP Desktop Manager + Interactive /home Virtual Terminal

let topZ = 20;
let sfxEnabled = localStorage.getItem('simonxp_sfx') !== 'off';
let audioCtx = null;

// ============================================================================
// SUBTLE RETRO XP UI SOUND SYNTHESIZER
// ============================================================================
function getAudioCtx() {
  if (!sfxEnabled) return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function playXpSound(type = 'click') {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  if (type === 'open') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.07);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  } else if (type === 'close') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(290, now + 0.07);
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  } else if (type === 'balloon') {
    [587.33, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.05, now + idx * 0.075);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.075 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.075);
      osc.stop(now + idx * 0.075 + 0.19);
    });
  }
}

// ============================================================================
// VIRTUAL READ-ONLY FILESYSTEM ROOTED AT /home
// ============================================================================
const VFS = {
  type: 'dir',
  children: {
    home: {
      type: 'dir',
      children: {
        'welcome.txt': {
          type: 'file',
          size: 412,
          content: [
            '============================================================',
            ' Welcome to SimonOS XP (Terminal Shell — /home)',
            '============================================================',
            'Hi! I am Simon Kye — Google SWE · BU \'25 BA/MS CS.',
            '',
            'Explore my portfolio right from the terminal:',
            '  ls                 List folders in the current directory',
            '  tree               Visualize the full /home directory tree',
            '  cd fun-projects    Enter a directory (supports .. and ~)',
            '  cat about/bio.txt  Read any file (also: head, tail, less)',
            '  grep pytorch       Search across all files in /home',
            '  open hk-3d-room    Launch interactive apps (/room.html, /folio)',
            '  neofetch           Print system & profile summary',
            '  help               Show all supported commands',
            '',
            'Note: This portfolio interface was made with AI.'
          ].join('\n')
        },
        about: {
          type: 'dir',
          children: {
            'bio.txt': {
              type: 'file',
              size: 960,
              content: [
                'Name: Simon Kye',
                'Role: Software Engineer at Google — Data Integrity Team, Google SecOps (Jun 2025 – Present)',
                'Journey: Hong Kong -> Boston -> San Jose -> NYC',
                '',
                'Hi! My name is Simon Kye. I am a Software Engineer at Google working on',
                'the Data Integrity Team in Google SecOps. I graduated from Boston',
                'University (\'25) with a BA/MS dual degree in Computer Science.',
                '',
                'I love programming because when something goes wrong, it is never for',
                'some mystical reason — there is always a logical trail behind how code',
                'behaves. At the same time, software engineering gives you huge creative',
                'freedom in how you design and build things.',
                '',
                'What motivates me most is real-world impact: I have worked on opening',
                'access to criminal justice data for fairer trials, and researched ML',
                'models to help identify missing children faster.'
              ].join('\n')
            },
            'education.txt': {
              type: 'file',
              size: 245,
              content: [
                'Boston University (Class of 2025)',
                'Degree: BA / MS Dual Degree in Computer Science',
                'Focus: Full-Stack Systems, Machine Learning, Data Infrastructure & Automation'
              ].join('\n')
            },
            'hobbies.txt': {
              type: 'file',
              size: 360,
              content: [
                'Current Hobbies:',
                '  * Piano       — Practicing "Rosalina\'s Observatory"',
                '  * Drawing     — Portrait lighting & chiaroscuro studies',
                '  * Cooking     — Cooking & experimenting with new recipes',
                '  * Working Out — Upper / lower strength training split',
                '  * Chinese     — HSK vocabulary & Mandarin graded readers'
              ].join('\n')
            }
          }
        },
        experience: {
          type: 'dir',
          children: {
            'google.txt': {
              type: 'file',
              size: 260,
              content: [
                'Google — Software Engineer (Google SecOps, Data Integrity Team)',
                'Dates: Jun 2025 – Present',
                '',
                '- Working on the Data Integrity Team in Google SecOps.'
              ].join('\n')
            },
            'bit-lab.txt': {
              type: 'file',
              size: 480,
              content: [
                'BIT Lab (Boston University) — Research Assistant',
                'Dates: Jan 2024 – Jun 2024',
                '',
                '- Conducted literature reviews and empirical analysis on AI data regulation,',
                '  generative AI, and trend-analysis algorithms in business analytics.',
                '- Built large-scale data collection jobs (200GB+ per run) across Wikipedia',
                '  and Reddit studying the training-data lifespan of AI systems.'
              ].join('\n')
            },
            'biscovery.txt': {
              type: 'file',
              size: 460,
              content: [
                'Biscovery Limited — Process Automation Intern',
                'Dates: May 2021 – May 2022',
                '',
                '- Automated 10+ hour manual workflows into sub-minute pipelines using UiPath,',
                '  Computer Vision, and automated Excel/email reporting.',
                '- Self-taught UiPath (50+ hrs) and earned the UiPath Certified Advanced RPA',
                '  Developer credential.'
              ].join('\n')
            },
            'cs-tutoring.txt': {
              type: 'file',
              size: 390,
              content: [
                'Freelance CS Tutor — AP CSA / IB CS HL',
                'Dates: Jan 2021 – Sep 2023',
                '',
                '- Taught weekly 1-on-1 AP CSA, IB CS HL, and youth coding.',
                '- Designed a 10-week project-based curriculum tailored to student interests,',
                '  inspiring students to major in Computer Science.'
              ].join('\n')
            },
            'praya-institute.txt': {
              type: 'file',
              size: 310,
              content: [
                'Praya Institute — Teacher\'s Assistant (AMC Mathematics)',
                '',
                '- Taught competition math (AMC) twice weekly to cohorts of 20 students.',
                '- Authored 16 problem sets and LaTeX solution guides for middle schoolers.'
              ].join('\n')
            }
          }
        },
        projects: {
          type: 'dir',
          children: {
            'competify.md': {
              type: 'file',
              url: 'https://github.com/KKeySimon/Competify',
              size: 612,
              content: [
                '# Competify (Aug 2024 – Present)',
                'Stack: Node, TypeScript, Express, React, Passport.js, Prisma, Discord.js',
                'Repo:  https://github.com/KKeySimon/Competify',
                '',
                'Engineered a full-stack web application promoting habit-building through',
                'interactive social competitions. Integrated Discord OAuth2, session-based',
                'email auth, and a custom Discord bot built from the ground up.'
              ].join('\n')
            },
            'atfal-mafkoda-ml.md': {
              type: 'file',
              url: 'https://github.com/BU-Spark/ml-atfal-mafkoda-missing-children',
              size: 580,
              content: [
                '# Atfal Mafkoda — Missing Children Identification (Jan – May 2024)',
                'Stack: PyTorch, Deep Learning, Encoder-Decoder',
                'Repo:  https://github.com/BU-Spark/ml-atfal-mafkoda-missing-children',
                '',
                'Researched and implemented encoder-decoder deep learning models to simulate',
                'the visual effects of homelessness on photos of missing persons, assisting',
                'families and investigators in faster identification.'
              ].join('\n')
            },
            'pickup-pal.md': {
              type: 'file',
              url: 'https://github.com/kathlynfs/GAS-PickupPal',
              size: 510,
              content: [
                '# Pickup Pal (Jan – May 2024)',
                'Stack: Kotlin, Jetpack Compose, Firebase, Figma Material 3',
                'Repo:  https://github.com/kathlynfs/GAS-PickupPal',
                '',
                'Android community app where neighbors post free curb items (couches, desks)',
                'with search, category filtering, user ratings, and proximity-verified claims.'
              ].join('\n')
            },
            'receipt-ocr.md': {
              type: 'file',
              url: 'https://github.com/KKeySimon/ReceiptOCR',
              size: 460,
              content: [
                '# Receipt OCR Bill Splitter (Jun 2023)',
                'Stack: AWS Textract, API Gateway, AWS Lambda, React Native, Expo',
                'Repo:  https://github.com/KKeySimon/ReceiptOCR',
                '',
                'Mobile app that photographs a receipt, extracts line items via AWS Textract',
                'OCR, and provides an intuitive interface to split and share the bill.'
              ].join('\n')
            },
            'boston-police-index.md': {
              type: 'file',
              url: 'https://dev-bpi.netlify.app/',
              size: 590,
              content: [
                '# Boston Police Index (Feb – May 2023)',
                'Stack: TypeScript, React, PostgreSQL, Scrum / Taiga',
                'Live:  https://dev-bpi.netlify.app/',
                '',
                'Core infrastructure & database pipeline tracking Boston police activity so',
                'public defenders and civil-rights advocates can surface officer history.'
              ].join('\n')
            },
            'bu-course-search.md': {
              type: 'file',
              url: 'https://bucoursesearch.web.app/',
              size: 540,
              content: [
                '# BU Course Search 2.0 (Dec 2022 – Jan 2023)',
                'Stack: React, Firebase, Python (BeautifulSoup), AWS Lambda',
                'Live:  https://bucoursesearch.web.app/',
                '',
                'Fast single-page replacement for BU\'s official course catalog with custom',
                'quality-of-life filters and automated 24h AWS Lambda database updates.'
              ].join('\n')
            },
            'artguessr.md': {
              type: 'file',
              url: 'https://artguessr.art/',
              size: 430,
              content: [
                '# ArtGuessr (Dec 2022 – Jan 2023)',
                'Stack: Firebase, Google OAuth, Decoupled REST API',
                'Live:  https://artguessr.art/',
                '',
                'GeoGuessr-inspired web game fetching museum artworks via API where players',
                'guess the origin of each piece and track their accuracy.'
              ].join('\n')
            }
          }
        },
        links: {
          type: 'dir',
          children: {
            'socials.txt': {
              type: 'file',
              size: 320,
              content: [
                'GitHub:         https://github.com/KKeySimon',
                'Website:        https://simonkye.com',
                '3D HK Room:     /room.html    (Fun Projects -> 3D Room)',
                'Folio App:      /folio/       (Fun Projects -> Folio)'
              ].join('\n')
            }
          }
        },
        'fun-projects': {
          type: 'dir',
          children: {
            'hk-3d-room.app': {
              type: 'app',
              url: './room.html',
              size: 8192,
              content: [
                '[EXECUTABLE 3D SCENE] 3D Hong Kong Childhood Room (Original Portfolio)',
                'URL: ./room.html',
                'Stack: Three.js, Blender, GSAP, Vite (Inspired by Boko33)',
                '',
                'An interactive 3D diorama of the bedroom in Hong Kong where I grew up',
                'for 13 years — every 3D asset modeled from scratch in Blender as a',
                'personal keepsake before moving.',
                '',
                '-> Run `open hk-3d-room.app` or `./hk-3d-room.app` to visit!'
              ].join('\n')
            },
            'folio.app': {
              type: 'app',
              url: './folio/',
              size: 4096,
              content: [
                '[EXECUTABLE WEB APP] Folio — Hobby & Habit Progress PWA',
                'URL: ./folio/',
                'Stack: Vanilla JS, IndexedDB, Service Worker PWA, Google Drive API v3',
                '',
                'An editorial Bento habit & hobby journal designed for wildly different',
                'hobbies (piano stage pipelines, drawing galleries, dish collections,',
                'workout rhythm & Chinese character tiers) with photo/video/audio',
                'milestones that auto-organize into Google Drive folders.',
                '',
                '-> Run `open folio.app` or `./folio.app` to launch!'
              ].join('\n')
            }
          }
        }
      }
    }
  }
};

// ============================================================================
// XP WINDOW MANAGER & TASKBAR STATE
// ============================================================================
const WIN_META = {
  welcome: { title: 'Welcome to SimonXP', icon: '🖥️', defaultPos: { x: 145, y: 34 } },
  'fun-projects': { title: 'Fun Projects', icon: '🎮', defaultPos: { x: 185, y: 58 } },
  projects: { title: 'Projects', icon: '📁', defaultPos: { x: 210, y: 68 } },
  about: { title: 'About Me', icon: '👤', defaultPos: { x: 170, y: 52 } },
  experience: { title: 'Work Experience', icon: '💼', defaultPos: { x: 225, y: 78 } },
  links: { title: 'Links & Portals', icon: '🔗', defaultPos: { x: 245, y: 92 } },
  terminal: { title: 'Terminal — /home', icon: '>_', defaultPos: { x: 165, y: 48 } }
};

let activeWinId = null;

function updateTaskbar() {
  const mount = document.getElementById('xpTaskTabs');
  if (!mount) return;

  const openWins = [...document.querySelectorAll('.xp-window')].filter(
    (el) => !el.classList.contains('hidden')
  );

  mount.innerHTML = openWins
    .map((el) => {
      const id = el.id.replace(/^win-/, '');
      const meta = WIN_META[id] || { title: id, icon: '📁' };
      const isMinimized = el.classList.contains('minimized');
      const isActive = activeWinId === id && !isMinimized;
      return `
        <button
          class="xp-task-tab ${isActive ? 'active' : ''}"
          type="button"
          data-task-tab="${id}"
          title="${meta.title}"
        >
          <span>${meta.icon}</span>
          <span style="overflow:hidden;text-overflow:ellipsis;">${meta.title}</span>
        </button>
      `;
    })
    .join('');

  mount.querySelectorAll('[data-task-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.taskTab;
      const win = document.getElementById(`win-${id}`);
      if (!win) return;
      if (win.classList.contains('minimized')) {
        win.classList.remove('minimized');
        focusWindow(id);
      } else if (activeWinId === id) {
        minimizeWindow(id);
      } else {
        focusWindow(id);
      }
    });
  });
}

function focusWindow(id) {
  const win = document.getElementById(`win-${id}`);
  if (!win) return;
  topZ += 1;
  win.style.zIndex = String(topZ);
  activeWinId = id;

  document.querySelectorAll('.xp-window').forEach((w) => {
    w.classList.toggle('inactive', w.id !== `win-${id}`);
  });
  updateTaskbar();

  if (id === 'terminal') {
    setTimeout(() => document.getElementById('termInput')?.focus(), 20);
  }
}

export function openWindow(id) {
  const win = document.getElementById(`win-${id}`);
  if (!win) return;

  closeStartMenu();
  const wasHidden = win.classList.contains('hidden');
  win.classList.remove('hidden', 'minimized');

  if (wasHidden && window.innerWidth > 720 && !win.dataset.positioned) {
    const meta = WIN_META[id];
    const rect = win.getBoundingClientRect();
    const x = Math.min(meta?.defaultPos?.x ?? 160, Math.max(20, window.innerWidth - rect.width - 24));
    const y = Math.min(meta?.defaultPos?.y ?? 50, Math.max(14, window.innerHeight - rect.height - 56));
    win.style.left = `${x}px`;
    win.style.top = `${y}px`;
    win.dataset.positioned = 'true';
  }

  focusWindow(id);
  playXpSound('open');
}

function minimizeWindow(id) {
  const win = document.getElementById(`win-${id}`);
  if (!win) return;
  win.classList.add('minimized');
  if (activeWinId === id) activeWinId = null;
  if (id === 'terminal') document.body.classList.remove('full-terminal-mode');
  updateTaskbar();
}

function toggleMaximizeWindow(id) {
  const win = document.getElementById(`win-${id}`);
  if (!win) return;
  if (id === 'terminal' && document.body.classList.contains('full-terminal-mode')) {
    document.body.classList.remove('full-terminal-mode');
    syncTerminalModeBtn();
    return;
  }
  win.classList.toggle('maximized');
  focusWindow(id);
}

function closeWindow(id) {
  const win = document.getElementById(`win-${id}`);
  if (!win) return;
  win.classList.add('hidden');
  win.classList.remove('minimized', 'maximized');
  if (id === 'terminal') {
    document.body.classList.remove('full-terminal-mode');
    syncTerminalModeBtn();
  }
  if (activeWinId === id) activeWinId = null;
  playXpSound('close');
  updateTaskbar();
}

function makeWindowDraggable(winEl) {
  const id = winEl.id.replace(/^win-/, '');
  const bar = winEl.querySelector('.xp-titlebar');
  if (!bar) return;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;

  winEl.addEventListener('pointerdown', () => focusWindow(id));

  bar.addEventListener('dblclick', (e) => {
    if (e.target.closest('button')) return;
    toggleMaximizeWindow(id);
  });

  bar.addEventListener('pointerdown', (e) => {
    if (window.innerWidth <= 720) return;
    if (winEl.classList.contains('maximized')) return;
    if (document.body.classList.contains('full-terminal-mode') && id === 'terminal') return;
    if (e.target.closest('button')) return;

    dragging = true;
    focusWindow(id);
    const rect = winEl.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    origLeft = rect.left;
    origTop = rect.top;
    bar.setPointerCapture(e.pointerId);
  });

  bar.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const nextLeft = Math.max(0, Math.min(window.innerWidth - 110, origLeft + (e.clientX - startX)));
    const nextTop = Math.max(0, Math.min(window.innerHeight - 76, origTop + (e.clientY - startY)));
    winEl.style.left = `${Math.round(nextLeft)}px`;
    winEl.style.top = `${Math.round(nextTop)}px`;
  });

  const endDrag = () => {
    dragging = false;
  };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);
}

// ============================================================================
// INTERACTIVE TERMINAL SHELL (/home)
// ============================================================================
const termState = {
  cwd: '/home',
  prevCwd: '/home',
  history: [],
  histIdx: -1
};

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizePath(inputPath = '', baseCwd = termState.cwd) {
  let raw = (inputPath || '').trim();
  if (!raw || raw === '~') return '/home';
  if (raw.startsWith('~/')) raw = '/home/' + raw.slice(2);
  const full = raw.startsWith('/') ? raw : `${baseCwd}/${raw}`;
  const parts = full.split('/').filter(Boolean);
  const stack = [];
  for (const p of parts) {
    if (p === '.') continue;
    if (p === '..') {
      if (stack.length > 1) stack.pop(); // Keep /home as root boundary or allow /
      else if (stack.length === 1 && stack[0] !== 'home') stack.pop();
    } else {
      stack.push(p);
    }
  }
  if (stack.length === 0) return '/home';
  return '/' + stack.join('/');
}

function getNode(absPath) {
  const parts = absPath.split('/').filter(Boolean);
  let cur = VFS;
  for (const seg of parts) {
    if (!cur || cur.type !== 'dir' || !cur.children[seg]) return null;
    cur = cur.children[seg];
  }
  return cur;
}

function formatDisplayCwd(cwd = termState.cwd) {
  if (cwd === '/home') return '~/home';
  if (cwd.startsWith('/home/')) return '~/' + cwd.slice(6);
  return cwd;
}

function updatePromptDisplay() {
  const el = document.getElementById('termCwdLabel');
  if (el) el.textContent = formatDisplayCwd(termState.cwd);
  const addr = document.getElementById('termTitlePath');
  if (addr) addr.textContent = `Terminal — ${termState.cwd}`;
}

function printTermHtml(html) {
  const out = document.getElementById('termOutput');
  const screen = document.getElementById('termScreen');
  if (!out || !screen) return;
  const div = document.createElement('div');
  div.className = 'term-line';
  div.innerHTML = html;
  out.appendChild(div);
  screen.scrollTop = screen.scrollHeight;
}

function printTermText(text, cls = '') {
  printTermHtml(cls ? `<span class="${cls}">${escapeHtml(text)}</span>` : escapeHtml(text));
}

function renderLs(args) {
  const flags = args.filter((a) => a.startsWith('-')).join('');
  const showLong = flags.includes('l');
  const showAll = flags.includes('a');
  const targets = args.filter((a) => !a.startsWith('-'));
  const targetPath = normalizePath(targets[0] || '.', termState.cwd);
  const node = getNode(targetPath);

  if (!node) {
    printTermText(`ls: cannot access '${targets[0]}': No such file or directory`, 'term-pink');
    return;
  }

  if (node.type !== 'dir') {
    const name = targetPath.split('/').pop();
    printTermHtml(`<span class="${node.type === 'app' ? 'term-exec' : 'term-file'}">${escapeHtml(name)}</span>`);
    return;
  }

  const entries = Object.entries(node.children);
  if (showLong) {
    if (showAll) {
      printTermText('drwxr-xr-x  simon  staff   160  Nov 21  .', 'term-dir');
      printTermText('drwxr-xr-x  simon  staff   128  Nov 21  ..', 'term-dir');
    }
    entries.forEach(([name, child]) => {
      const perms = child.type === 'dir' ? 'drwxr-xr-x' : child.type === 'app' ? '-rwxr-xr-x' : '-rw-r--r--';
      const sz = String(child.size || 512).padStart(5, ' ');
      const cls = child.type === 'dir' ? 'term-dir' : child.type === 'app' ? 'term-exec' : 'term-file';
      const suffix = child.type === 'dir' ? '/' : child.type === 'app' ? '*' : '';
      printTermHtml(
        `<span class="term-muted">${perms}  simon  staff  ${sz}  Nov 21 </span> <span class="${cls}">${escapeHtml(name + suffix)}</span>`
      );
    });
    return;
  }

  const parts = [];
  if (showAll) {
    parts.push(`<span class="term-dir">.</span>`, `<span class="term-dir">..</span>`);
  }
  entries.forEach(([name, child]) => {
    if (child.type === 'dir') {
      parts.push(`<span class="term-dir">${escapeHtml(name)}/</span>`);
    } else if (child.type === 'app') {
      parts.push(`<span class="term-exec">${escapeHtml(name)}*</span>`);
    } else {
      parts.push(`<span class="term-file">${escapeHtml(name)}</span>`);
    }
  });
  printTermHtml(parts.join('   '));
}

function buildTreeLines(node, prefix = '') {
  if (!node || node.type !== 'dir') return [];
  const entries = Object.entries(node.children);
  const lines = [];
  entries.forEach(([name, child], idx) => {
    const isLast = idx === entries.length - 1;
    const branch = isLast ? '└── ' : '├── ';
    const cls = child.type === 'dir' ? 'term-dir' : child.type === 'app' ? 'term-exec' : 'term-file';
    const suffix = child.type === 'dir' ? '/' : child.type === 'app' ? '*' : '';
    lines.push(`${escapeHtml(prefix + branch)}<span class="${cls}">${escapeHtml(name + suffix)}</span>`);
    if (child.type === 'dir') {
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');
      lines.push(...buildTreeLines(child, nextPrefix));
    }
  });
  return lines;
}

function collectAllFiles(node, currentPath) {
  const results = [];
  if (!node || node.type !== 'dir') return results;
  for (const [name, child] of Object.entries(node.children)) {
    const full = `${currentPath}/${name}`;
    results.push({ path: full, node: child });
    if (child.type === 'dir') {
      results.push(...collectAllFiles(child, full));
    }
  }
  return results;
}

function runReadCommand(cmd, args) {
  let lineCount = 10;
  const filteredArgs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-n' && args[i + 1]) {
      lineCount = Math.max(1, parseInt(args[i + 1], 10) || 10);
      i++;
    } else {
      filteredArgs.push(args[i]);
    }
  }

  if (filteredArgs.length === 0) {
    printTermText(`usage: ${cmd} <file>  (e.g., ${cmd} welcome.txt or ${cmd} about/bio.txt)`, 'term-muted');
    return;
  }

  // Expand '*' wildcard inside current directory
  const expandedTargets = [];
  filteredArgs.forEach((arg) => {
    if (arg === '*') {
      const curDir = getNode(termState.cwd);
      if (curDir?.type === 'dir') {
        Object.entries(curDir.children).forEach(([k, v]) => {
          if (v.type !== 'dir') expandedTargets.push(k);
        });
      }
    } else {
      expandedTargets.push(arg);
    }
  });

  expandedTargets.forEach((rawTarget) => {
    const abs = normalizePath(rawTarget, termState.cwd);
    const node = getNode(abs);
    if (!node) {
      printTermText(`${cmd}: ${rawTarget}: No such file or directory`, 'term-pink');
      return;
    }
    if (node.type === 'dir') {
      printTermText(`${cmd}: ${rawTarget}: Is a directory (try 'ls ${rawTarget}')`, 'term-accent');
      return;
    }

    const lines = (node.content || '').split('\n');
    let outLines = lines;
    if (cmd === 'head') outLines = lines.slice(0, lineCount);
    if (cmd === 'tail') outLines = lines.slice(-lineCount);

    if (expandedTargets.length > 1) {
      printTermText(`==> ${rawTarget} <==`, 'term-accent');
    }
    printTermText(outLines.join('\n'));
    if (node.url) {
      printTermHtml(
        `<span class="term-muted">Link: </span><a class="term-link" href="${escapeHtml(node.url)}" ${
          node.url.startsWith('http') ? 'target="_blank" rel="noopener"' : ''
        }>${escapeHtml(node.url)} ↗</a>`
      );
    }
  });
}

export function executeTerminalCommand(rawLine) {
  const trimmed = rawLine.trim();
  const promptHtml = `<span class="term-prompt">simon@xp:<span class="term-cwd">${escapeHtml(
    formatDisplayCwd()
  )}</span>$</span> ${escapeHtml(rawLine)}`;
  printTermHtml(promptHtml);

  if (!trimmed) return;
  termState.history.push(trimmed);
  termState.histIdx = termState.history.length;

  const segments = trimmed.split(/\s*(?:&&|;)\s*/).filter(Boolean);
  segments.forEach((seg) => runSingleSegment(seg));
}

function runSingleSegment(segment) {
  // Support ./app shorthand
  let cmdLine = segment.trim();
  if (cmdLine.startsWith('./')) {
    cmdLine = 'open ' + cmdLine.slice(2);
  }

  const tokens = cmdLine.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((t) => t.replace(/^"|"$/g, '')) || [];
  const cmd = (tokens[0] || '').toLowerCase();
  const args = tokens.slice(1);

  switch (cmd) {
    case 'help':
    case '?':
      printTermHtml(
        [
          '<span class="term-accent">Available Read &amp; Shell Commands:</span>',
          '  <span class="term-exec">ls [-la] [dir]</span>     List directory contents',
          '  <span class="term-exec">cd &lt;dir&gt;</span>           Change directory (.., ~, -, fun-projects, projects...)',
          '  <span class="term-exec">pwd</span>                Print current working directory',
          '  <span class="term-exec">cat &lt;file&gt;</span>         Print file contents (supports `cat *`)',
          '  <span class="term-exec">head / tail &lt;file&gt;</span> Read first or last lines of a file (-n N)',
          '  <span class="term-exec">less / more &lt;file&gt;</span> View file contents',
          '  <span class="term-exec">grep &lt;query&gt;</span>       Search text across all files in /home',
          '  <span class="term-exec">tree [dir]</span>         Display ASCII directory tree',
          '  <span class="term-exec">find [pattern]</span>     Find files and folders under /home',
          '  <span class="term-exec">wc / file &lt;file&gt;</span>   Count lines/words or inspect file type',
          '  <span class="term-exec">open &lt;app|folder&gt;</span>  Launch folio.app, hk-3d-room.app, or an XP window',
          '  <span class="term-exec">neofetch / whoami</span>  Display SimonOS XP system profile',
          '  <span class="term-exec">fullscreen / gui</span>   Toggle full-screen Terminal Mode vs XP Desktop',
          '  <span class="term-exec">clear</span>              Clear terminal output'
        ].join('\n')
      );
      break;

    case 'ls':
    case 'dir':
      renderLs(args);
      break;

    case 'pwd':
      printTermText(termState.cwd);
      break;

    case 'cd': {
      const targetRaw = args[0] || '~';
      const dest = targetRaw === '-' ? termState.prevCwd : normalizePath(targetRaw, termState.cwd);
      const node = getNode(dest);
      if (!node) {
        printTermText(`cd: no such file or directory: ${targetRaw}`, 'term-pink');
      } else if (node.type !== 'dir') {
        printTermText(`cd: not a directory: ${targetRaw} (use 'cat ${targetRaw}' to read it)`, 'term-accent');
      } else {
        termState.prevCwd = termState.cwd;
        termState.cwd = dest;
        updatePromptDisplay();
      }
      break;
    }

    case 'cat':
    case 'less':
    case 'more':
    case 'head':
    case 'tail':
    case 'type':
      runReadCommand(cmd === 'type' ? 'cat' : cmd, args);
      break;

    case 'tree': {
      const target = normalizePath(args[0] || '.', termState.cwd);
      const node = getNode(target);
      if (!node || node.type !== 'dir') {
        printTermText(`tree: '${args[0]}' is not a directory`, 'term-pink');
        break;
      }
      printTermHtml(`<span class="term-dir">${escapeHtml(target)}</span>`);
      const lines = buildTreeLines(node);
      printTermHtml(lines.join('\n'));
      break;
    }

    case 'grep': {
      const query = args[0];
      if (!query) {
        printTermText('usage: grep <search-term> [path]', 'term-muted');
        break;
      }
      const rootPath = args[1] ? normalizePath(args[1], termState.cwd) : '/home';
      const startNode = getNode(rootPath);
      if (!startNode) {
        printTermText(`grep: ${args[1]}: No such file or directory`, 'term-pink');
        break;
      }
      const files =
        startNode.type === 'dir' ? collectAllFiles(startNode, rootPath) : [{ path: rootPath, node: startNode }];
      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      let hits = 0;
      files.forEach(({ path, node }) => {
        if (node.type === 'dir' || !node.content) return;
        node.content.split('\n').forEach((line, idx) => {
          if (regex.test(line)) {
            hits++;
            printTermHtml(
              `<span class="term-pink">${escapeHtml(path)}:${idx + 1}:</span> ${escapeHtml(line)}`
            );
          }
        });
      });
      if (hits === 0) printTermText(`(no matches for '${query}' under ${rootPath})`, 'term-muted');
      break;
    }

    case 'find': {
      const pattern = (args.find((a) => !a.startsWith('.') && !a.startsWith('-')) || '').toLowerCase();
      const all = collectAllFiles(getNode('/home'), '/home');
      const matches = all.filter((item) => !pattern || item.path.toLowerCase().includes(pattern));
      matches.forEach((m) => {
        const cls = m.node.type === 'dir' ? 'term-dir' : m.node.type === 'app' ? 'term-exec' : 'term-file';
        printTermHtml(`<span class="${cls}">${escapeHtml(m.path)}</span>`);
      });
      break;
    }

    case 'wc': {
      if (!args[0]) {
        printTermText('usage: wc <file>', 'term-muted');
        break;
      }
      const abs = normalizePath(args[0], termState.cwd);
      const node = getNode(abs);
      if (!node || node.type === 'dir') {
        printTermText(`wc: ${args[0]}: Invalid file`, 'term-pink');
        break;
      }
      const txt = node.content || '';
      const l = txt.split('\n').length;
      const w = txt.trim().split(/\s+/).filter(Boolean).length;
      const c = txt.length;
      printTermText(`  ${l}  ${w}  ${c} ${args[0]}`);
      break;
    }

    case 'file': {
      if (!args[0]) {
        printTermText('usage: file <path>', 'term-muted');
        break;
      }
      const abs = normalizePath(args[0], termState.cwd);
      const node = getNode(abs);
      if (!node) {
        printTermText(`${args[0]}: cannot open (No such file or directory)`, 'term-pink');
      } else if (node.type === 'dir') {
        printTermText(`${args[0]}: directory`);
      } else if (node.type === 'app') {
        printTermText(`${args[0]}: interactive web application (${node.url})`);
      } else {
        printTermText(`${args[0]}: UTF-8 Unicode text (${(node.content || '').split('\n').length} lines)`);
      }
      break;
    }

    case 'open':
    case 'start':
    case 'xdg-open': {
      const target = (args[0] || '').toLowerCase().replace(/\/$/, '');
      if (!target) {
        printTermText('usage: open <folio | hk-3d-room | fun-projects | projects | about | experience | links>', 'term-muted');
        break;
      }
      if (target.includes('folio')) {
        printTermText('Launching Folio (./folio/)...', 'term-exec');
        window.location.href = './folio/';
        return;
      }
      if (target.includes('room') || target.includes('3d')) {
        printTermText('Launching 3D Hong Kong Room (./room.html)...', 'term-exec');
        window.location.href = './room.html';
        return;
      }
      const abs = normalizePath(args[0], termState.cwd);
      const node = getNode(abs);
      if (node?.url) {
        printTermText(`Opening ${node.url}...`, 'term-exec');
        if (node.url.startsWith('http')) window.open(node.url, '_blank', 'noopener');
        else window.location.href = node.url;
        return;
      }
      const winMap = {
        about: 'about',
        projects: 'projects',
        'fun-projects': 'fun-projects',
        fun: 'fun-projects',
        experience: 'experience',
        links: 'links',
        welcome: 'welcome'
      };
      const winKey = winMap[target.split('/').pop()];
      if (winKey) {
        document.body.classList.remove('full-terminal-mode');
        syncTerminalModeBtn();
        openWindow(winKey);
        printTermText(`Opened '${WIN_META[winKey].title}' window on desktop.`, 'term-accent');
      } else {
        printTermText(`open: unknown target '${args[0]}'`, 'term-pink');
      }
      break;
    }

    case 'whoami':
      printTermText('simon (Simon Kye — Google SWE · BU \'25 BA/MS CS)');
      break;

    case 'uname':
      printTermText('SimonXP 5.1.2600 Luna-x86_64 VirtualPortfolio');
      break;

    case 'date':
      printTermText(new Date().toString());
      break;

    case 'echo':
      printTermText(args.join(' '));
      break;

    case 'history':
      termState.history.forEach((h, i) => printTermText(`  ${String(i + 1).padStart(3, ' ')}  ${h}`));
      break;

    case 'neofetch':
      printTermHtml(
        [
          '<span class="term-dir">   ████████╗ ████████╗</span>   <span class="term-exec">simon@simonkye.com</span>',
          '<span class="term-dir">   ██╔═════╝ ██╔═════╝</span>   ------------------',
          '<span class="term-exec">   ████████╗ ████████╗</span>   <span class="term-accent">Role:</span> Google SWE · SecOps Data Integrity (Jun 2025–)',
          '<span class="term-accent">   ██╔═════╝ ██╔═════╝</span>   <span class="term-accent">Education:</span> Boston University BA/MS CS (\'25)',
          '<span class="term-pink">   ████████╗ ████████╗</span>   <span class="term-accent">Journey:</span> Hong Kong -> Boston -> San Jose -> NYC',
          '<span class="term-pink">   ╚═══════╝ ╚═══════╝</span>   <span class="term-accent">Fun Apps:</span> 3D HK Room (/room.html) &amp; Folio (/folio/)',
          '                         <span class="term-accent">Hobbies:</span> Piano, Drawing, Cooking, Gym, Chinese',
          '                         <span class="term-accent">Shell:</span> simon-sh (/home read-only VFS)'
        ].join('\n')
      );
      break;

    case 'clear':
    case 'cls': {
      const out = document.getElementById('termOutput');
      if (out) out.innerHTML = '';
      break;
    }

    case 'fullscreen':
      toggleFullTerminalMode(true);
      break;

    case 'gui':
    case 'exit':
      if (document.body.classList.contains('full-terminal-mode')) {
        toggleFullTerminalMode(false);
        printTermText('Switched back to Windows XP GUI Desktop.', 'term-accent');
      } else {
        closeWindow('terminal');
      }
      break;

    case 'rm':
    case 'mkdir':
    case 'touch':
    case 'mv':
    case 'vim':
    case 'nano':
      printTermText(`${cmd}: /home is mounted read-only (try 'cat', 'ls', 'cd', 'tree', 'grep', or 'open')`, 'term-accent');
      break;

    default:
      printTermText(`${cmd}: command not found. Type 'help' to see supported commands.`, 'term-pink');
  }
}

function handleTabCompletion(inputEl) {
  const val = inputEl.value;
  const parts = val.split(/\s+/);
  const commands = [
    'help', 'ls', 'cd', 'pwd', 'cat', 'head', 'tail', 'less', 'grep', 'tree', 'find', 'wc', 'file', 'open', 'neofetch', 'whoami', 'history', 'clear', 'gui'
  ];

  if (parts.length <= 1 && !val.endsWith(' ')) {
    const prefix = parts[0].toLowerCase();
    const matches = commands.filter((c) => c.startsWith(prefix));
    if (matches.length === 1) inputEl.value = matches[0] + ' ';
    return;
  }

  const lastToken = val.endsWith(' ') ? '' : parts[parts.length - 1];
  const slashIdx = lastToken.lastIndexOf('/');
  const dirPart = slashIdx >= 0 ? lastToken.slice(0, slashIdx + 1) : '';
  const namePrefix = slashIdx >= 0 ? lastToken.slice(slashIdx + 1) : lastToken;

  const searchDir = normalizePath(dirPart || '.', termState.cwd);
  const dirNode = getNode(searchDir);
  if (!dirNode || dirNode.type !== 'dir') return;

  const candidates = Object.keys(dirNode.children).filter((k) =>
    k.toLowerCase().startsWith(namePrefix.toLowerCase())
  );

  if (candidates.length === 1) {
    const match = candidates[0];
    const isSubDir = dirNode.children[match].type === 'dir';
    const completed = dirPart + match + (isSubDir ? '/' : ' ');
    const head = val.endsWith(' ') ? val : parts.slice(0, -1).join(' ') + (parts.length > 1 ? ' ' : '');
    inputEl.value = head + completed;
  } else if (candidates.length > 1) {
    printTermHtml(
      `<span class="term-muted">${candidates.map((c) => escapeHtml(c)).join('   ')}</span>`
    );
  }
}

function syncTerminalModeBtn() {
  const isFull = document.body.classList.contains('full-terminal-mode');
  const btn = document.getElementById('btnToggleTermFull');
  if (btn) btn.textContent = isFull ? '❐ Exit Fullscreen (GUI)' : '⛶ Full Terminal Mode';
}

function toggleFullTerminalMode(force) {
  const next = typeof force === 'boolean' ? force : !document.body.classList.contains('full-terminal-mode');
  if (next) {
    openWindow('terminal');
    document.body.classList.add('full-terminal-mode');
  } else {
    document.body.classList.remove('full-terminal-mode');
  }
  syncTerminalModeBtn();
  setTimeout(() => document.getElementById('termInput')?.focus(), 30);
}

// ============================================================================
// START MENU, CLOCK & INITIALIZATION
// ============================================================================
function closeStartMenu() {
  document.getElementById('xpStartMenu')?.classList.add('hidden');
}

function updateClock() {
  const el = document.getElementById('xpClock');
  if (!el) return;
  el.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function syncNightTheme(isNight) {
  document.documentElement.classList.toggle('night-theme', isNight);
  document.body.classList.toggle('night-theme', isNight);
  const btn = document.getElementById('btnTrayTheme');
  if (btn) btn.textContent = isNight ? '☀️' : '🌙';
}

function syncSfxTray() {
  const btn = document.getElementById('btnTraySfx');
  if (btn) btn.textContent = sfxEnabled ? '🔊' : '🔇';
}

function init() {
  syncNightTheme(localStorage.getItem('simonxp_theme') === 'night');
  syncSfxTray();
  updateClock();
  setInterval(updateClock, 15000);

  // Wire all xp-window instances
  document.querySelectorAll('.xp-window').forEach((w) => makeWindowDraggable(w));

  document.querySelectorAll('[data-open-win]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const target = el.dataset.openWin;
      if (document.body.classList.contains('full-terminal-mode') && target !== 'terminal') {
        toggleFullTerminalMode(false);
      }
      openWindow(target);
    });
  });

  document.querySelectorAll('[data-min-win]').forEach((btn) => {
    btn.addEventListener('click', () => minimizeWindow(btn.dataset.minWin));
  });
  document.querySelectorAll('[data-max-win]').forEach((btn) => {
    btn.addEventListener('click', () => toggleMaximizeWindow(btn.dataset.maxWin));
  });
  document.querySelectorAll('[data-close-win]').forEach((btn) => {
    btn.addEventListener('click', () => closeWindow(btn.dataset.closeWin));
  });

  // Start menu toggle
  const startBtn = document.getElementById('btnStartMenu');
  const startMenu = document.getElementById('xpStartMenu');
  startBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    startMenu?.classList.toggle('hidden');
  });
  document.addEventListener('pointerdown', (e) => {
    if (!startMenu?.classList.contains('hidden')) {
      if (!e.target.closest('#xpStartMenu') && !e.target.closest('#btnStartMenu')) {
        closeStartMenu();
      }
    }
  });

  // System tray & Start footer actions
  const toggleTheme = () => {
    const next = !document.body.classList.contains('night-theme');
    localStorage.setItem('simonxp_theme', next ? 'night' : 'day');
    syncNightTheme(next);
  };
  document.getElementById('btnTrayTheme')?.addEventListener('click', toggleTheme);
  document.getElementById('btnStartTheme')?.addEventListener('click', () => {
    toggleTheme();
    closeStartMenu();
  });

  document.getElementById('btnTraySfx')?.addEventListener('click', () => {
    sfxEnabled = !sfxEnabled;
    localStorage.setItem('simonxp_sfx', sfxEnabled ? 'on' : 'off');
    syncSfxTray();
    if (sfxEnabled) playXpSound('balloon');
  });

  document.getElementById('btnTrayTerm')?.addEventListener('click', () => toggleFullTerminalMode());
  document.getElementById('btnStartTermMode')?.addEventListener('click', () => {
    closeStartMenu();
    toggleFullTerminalMode(true);
  });
  document.getElementById('btnToggleTermFull')?.addEventListener('click', () => toggleFullTerminalMode());

  // Cute XP Balloon Tip
  const balloon = document.getElementById('xpBalloon');
  document.getElementById('btnCloseBalloon')?.addEventListener('click', () => {
    balloon?.classList.add('hidden');
  });
  document.getElementById('btnBalloonOpenTerm')?.addEventListener('click', () => {
    balloon?.classList.add('hidden');
    openWindow('terminal');
  });

  // Boot terminal welcome banner
  updatePromptDisplay();
  printTermHtml(
    [
      '<span class="term-accent">SimonOS XP Virtual Shell [Version 5.1.2600]</span>',
      '<span class="term-muted">Mounted /home read-only filesystem. Type `help`, `ls`, `tree`, or `cat welcome.txt`.</span>',
      ''
    ].join('\n')
  );
  executeTerminalCommand('ls');

  const termInput = document.getElementById('termInput');
  const termScreen = document.getElementById('termScreen');
  termScreen?.addEventListener('click', (e) => {
    if (window.getSelection()?.toString()) return;
    if (e.target.closest('a')) return;
    termInput?.focus();
  });

  termInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const cmd = termInput.value;
      termInput.value = '';
      executeTerminalCommand(cmd);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleTabCompletion(termInput);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (termState.history.length > 0) {
        termState.histIdx = Math.max(0, termState.histIdx - 1);
        termInput.value = termState.history[termState.histIdx] || '';
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (termState.histIdx < termState.history.length - 1) {
        termState.histIdx++;
        termInput.value = termState.history[termState.histIdx] || '';
      } else {
        termState.histIdx = termState.history.length;
        termInput.value = '';
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      const out = document.getElementById('termOutput');
      if (out) out.innerHTML = '';
    }
  });

  document.querySelectorAll('[data-run-cmd]').forEach((chip) => {
    chip.addEventListener('click', () => {
      executeTerminalCommand(chip.dataset.runCmd);
      termInput?.focus();
    });
  });

  // Open Welcome window on desktop initial load so visitors immediately see Simon's intro + folders
  if (window.innerWidth > 720) {
    openWindow('welcome');
  }
}

init();
