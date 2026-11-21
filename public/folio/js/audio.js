// Microphone Audio Recorder for Piano / Language clips + warm Web Audio sample preview

let mediaRecorder = null;
let recordedChunks = [];
let activeStream = null;

export const audioRecorder = {
  isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  },

  async start() {
    activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/mp4')
      ? 'audio/mp4'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : '';
    mediaRecorder = mimeType
      ? new MediaRecorder(activeStream, { mimeType })
      : new MediaRecorder(activeStream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.start();
  },

  stop() {
    return new Promise((resolve) => {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        this.cleanup();
        resolve(null);
        return;
      }
      mediaRecorder.onstop = () => {
        const mime = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(recordedChunks, { type: mime });
        this.cleanup();
        resolve({ blob, mime });
      };
      mediaRecorder.stop();
    });
  },

  cleanup() {
    if (activeStream) {
      activeStream.getTracks().forEach((t) => t.stop());
      activeStream = null;
    }
    mediaRecorder = null;
  }
};

// Gentle Debussy Clair de Lune inspired D-flat major arpeggiated snippet for the sample Piano milestone
let demoCtx = null;
let demoPlaying = false;

export function playDemoPianoPhrase(onEnded) {
  if (demoPlaying && demoCtx) {
    demoCtx.close();
    demoCtx = null;
    demoPlaying = false;
    if (onEnded) onEnded();
    return false;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;

  demoCtx = new AudioContextClass();
  demoPlaying = true;
  const now = demoCtx.currentTime;

  // Clair de Lune opening interval colors (Db major -> Gb6 -> Db/F -> Bbm7)
  const notes = [
    { f: 554.37, t: 0.1, d: 2.2, v: 0.12 },  // Db5
    { f: 440.00, t: 0.12, d: 2.2, v: 0.11 }, // Ab4 (enharmonic) / F4: 349.23
    { f: 349.23, t: 0.1, d: 2.4, v: 0.10 },  // F4
    { f: 138.59, t: 0.05, d: 3.2, v: 0.09 }, // Db3 bass
    { f: 415.30, t: 0.85, d: 1.5, v: 0.11 }, // Ab4
    { f: 349.23, t: 1.35, d: 1.5, v: 0.11 }, // F4
    { f: 311.13, t: 2.05, d: 1.2, v: 0.11 }, // Eb4
    { f: 349.23, t: 2.45, d: 1.8, v: 0.12 }, // F4
    { f: 277.18, t: 2.05, d: 2.4, v: 0.09 }, // Db4
    { f: 185.00, t: 2.05, d: 2.5, v: 0.08 }, // Gb3
    { f: 277.18, t: 3.65, d: 2.2, v: 0.11 }, // Db4 resolve
    { f: 207.65, t: 3.68, d: 2.2, v: 0.09 }, // Ab3
    { f: 138.59, t: 3.65, d: 2.4, v: 0.10 }  // Db3
  ];

  notes.forEach(({ f, t, d, v }) => {
    const osc = demoCtx.createOscillator();
    const overtone = demoCtx.createOscillator();
    const gain = demoCtx.createGain();
    const filter = demoCtx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.value = f;
    overtone.type = 'sine';
    overtone.frequency.value = f * 2;

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, now + t);
    filter.frequency.exponentialRampToValueAtTime(420, now + t + d);

    gain.gain.setValueAtTime(0.0001, now + t);
    gain.gain.linearRampToValueAtTime(v, now + t + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + t + d);

    const overGain = demoCtx.createGain();
    overGain.gain.value = 0.25;

    osc.connect(filter);
    overtone.connect(overGain);
    overGain.connect(filter);
    filter.connect(gain);
    gain.connect(demoCtx.destination);

    osc.start(now + t);
    overtone.start(now + t);
    osc.stop(now + t + d + 0.05);
    overtone.stop(now + t + d + 0.05);
  });

  setTimeout(() => {
    if (demoPlaying && demoCtx) {
      demoCtx.close();
      demoCtx = null;
      demoPlaying = false;
      if (onEnded) onEnded();
    }
  }, 6100);

  return true;
}
