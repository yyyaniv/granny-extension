export function speechSupported() {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

export const MESSAGES = {
  unsupported: 'Голосовий пошук тут не працює. Скористайтеся кнопками.',
  'not-allowed': 'Немає доступу до мікрофона. Попросіть онука дозволити мікрофон у налаштуваннях.',
  'service-not-allowed': 'Немає доступу до мікрофона. Попросіть онука дозволити мікрофон у налаштуваннях.',
  'audio-capture': 'Мікрофон не знайдено. Перевірте, чи він підключений.',
  'no-speech': 'Нічого не чути. Спробуйте ще раз і говоріть голосніше.',
  network: 'Немає інтернету. Перевірте зʼєднання.',
  other: 'Не вдалося розпізнати. Спробуйте ще раз.',
};

/** Start one recognition session. Returns {stop()} */
export function listen({ onInterim, onResult, onError }) {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) { onError(MESSAGES.unsupported); return { stop() {} }; }
  const r = new R();
  r.lang = 'uk-UA';
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  let text = '';
  let failed = false;
  r.onresult = (e) => {
    text = [...e.results].map((x) => x[0].transcript).join(' ').trim();
    if (onInterim) onInterim(text);
  };
  r.onerror = (e) => {
    if (e.error === 'aborted') return;
    failed = true;
    onError(MESSAGES[e.error] || MESSAGES.other);
  };
  r.onend = () => {
    if (failed) return;
    if (text) onResult(text);
    else onError(MESSAGES['no-speech']);
  };
  try { r.start(); } catch { onError(MESSAGES.other); }
  return { stop() { try { r.abort(); } catch { /* ignore */ } } };
}
