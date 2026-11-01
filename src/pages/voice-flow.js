import { listen, speechSupported, MESSAGES } from './speech.js';
import { buildTopicQuery, buildYoutubeSearchUrl } from '../lib/query.js';
import { el, focusFirst } from './nav.js';

/** Renders mic -> listening -> confirm flow into `root`. */
export function startVoiceFlow(root, { prefix = '' } = {}) {
  let session = null;

  const show = (...nodes) => { root.replaceChildren(...nodes); focusFirst(); };

  function idle(message = '', isError = false) {
    if (session) { session.stop(); session = null; }
    show(
      el('div', { class: `msg ${isError ? 'error' : ''}`, text: message }),
      el('button', { class: 'big accent', 'data-nav': true, 'data-autofocus': true, onclick: begin },
        el('span', { class: 'icon', text: '🎤' }), el('span', { text: 'Натисніть і говоріть' })),
    );
  }

  function begin() {
    if (!speechSupported()) return idle(MESSAGES.unsupported, true);
    const live = el('div', { class: 'huge', text: '…' });
    show(
      el('div', { class: 'msg', text: '🎤 Слухаю… Говоріть' }),
      live,
      el('button', { class: 'big muted small', 'data-nav': true, 'data-autofocus': true, onclick: () => idle() }, 'Скасувати'),
    );
    session = listen({
      onInterim: (t) => { live.textContent = t || '…'; },
      onResult: confirm,
      onError: (m) => idle(m, true),
    });
  }

  function confirm(text) {
    const query = buildTopicQuery(prefix, text);
    show(
      el('div', { class: 'msg', text: 'Ви сказали:' }),
      el('div', { class: 'huge', text: query }),
      el('div', { class: 'msg', text: 'Шукати це?' }),
      el('div', { class: 'stack' },
        el('a', { class: 'big accent', href: buildYoutubeSearchUrl(query), 'data-nav': true, 'data-autofocus': true }, '✅ Так, шукати'),
        el('button', { class: 'big muted', 'data-nav': true, onclick: begin }, '🎤 Сказати ще раз'),
      ),
    );
  }

  idle();
  return { begin };
}
