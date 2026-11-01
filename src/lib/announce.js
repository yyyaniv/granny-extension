// Announcement sound: custom audio (data URL) or a WebAudio chime.
// speechSynthesis is used only if a Ukrainian voice exists.

let ctx = null;

export function playChime() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended') ctx.resume();
    const notes = [659.25, 880, 1046.5, 880, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.35;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.65);
    });
  } catch { /* sound is best effort */ }
}

function speakIfUkrainian(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    const voice = speechSynthesis.getVoices().find((v) => /^uk/i.test(v.lang));
    if (!voice) return;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = 'uk-UA';
    speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

export async function playAnnouncement(audioDataUrl, name) {
  if (audioDataUrl) {
    try {
      const a = new Audio(audioDataUrl);
      await a.play();
      return;
    } catch { /* fall through to chime */ }
  }
  playChime();
  if (name) setTimeout(() => speakIfUkrainian(`Скоро ${name}`), 2500);
}
