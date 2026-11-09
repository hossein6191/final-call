// Settings sheet: music and effects volume, mute, vibration, tutorial replay.
import { state, accLink, esc, toast } from '../state.ts';
import { getVolume, setVolume, isMuted, toggleMute, unlock, sound } from '../audio.ts';
import { replayTutorial } from './coach.ts';
import { showHowto } from '../screens/howto.ts';

const SPEAKER = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>`;
const NOTE = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;

function slider(id: string, label: string, icon: string, value: number) {
  return `<label class="set-row"><span class="set-ico">${icon}</span><span class="set-lbl">${label}</span>
    <input type="range" class="range" id="${id}" min="0" max="100" value="${Math.round(value * 100)}" style="--v:${Math.round(value * 100)}%"/></label>`;
}
function toggle(id: string, label: string, on: boolean, sub = '') {
  return `<div class="set-row"><span class="set-lbl">${label}${sub ? `<small>${sub}</small>` : ''}</span>
    <button class="switch ${on ? 'on' : ''}" id="${id}" role="switch" aria-checked="${on}"><i></i></button></div>`;
}

export function showSettings() {
  document.querySelector('.settings')?.remove();
  const v = getVolume();
  const el = document.createElement('div');
  el.className = 'overlay settings';
  el.innerHTML = `
    <div class="sheet">
      <div class="row"><div class="h1 grow">Settings</div><button class="icon-btn" id="sx" aria-label="Close">✕</button></div>
      <div class="panel set">
        ${toggle('smute', 'Sound', !isMuted(), 'All game audio')}
        ${slider('smusic', 'Music', NOTE, v.music)}
        ${slider('ssfx', 'Effects', SPEAKER, v.sfx)}
        ${toggle('shap', 'Vibration', v.haptics, 'Phones only')}
      </div>
      <div class="panel set">
        <button class="set-row link" id="shelp"><span class="set-lbl">How to play</span><span>›</span></button>
        <button class="set-row link" id="stut"><span class="set-lbl">Replay the tutorial<small>The coach comes back on your next bag</small></span><span>›</span></button>
      </div>
      <div class="panel small muted">
        ${state.id ? `Signed in as <b>${esc(state.id.nickname)}</b> · ${accLink(state.id.account)}<br>` : ''}
        Your browser holds the only key to your account. Clearing this site's data loses it.
      </div>
      <button class="btn primary" id="sdone">DONE</button>
    </div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.addEventListener('click', (e) => e.target === el && close());
  (el.querySelector('#sx') as HTMLButtonElement).onclick = close;
  (el.querySelector('#sdone') as HTMLButtonElement).onclick = () => {
    sound.tap();
    close();
  };
  const sw = (id: string, fn: (on: boolean) => void) => {
    const b = el.querySelector(`#${id}`) as HTMLButtonElement;
    b.onclick = () => {
      unlock();
      const on = !b.classList.contains('on');
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
      fn(on);
      sound.tap();
    };
  };
  sw('smute', (on) => {
    if (on === isMuted()) toggleMute();
    document.dispatchEvent(new CustomEvent('mute'));
  });
  sw('shap', (on) => setVolume({ haptics: on }));
  const rng = (id: string, key: 'music' | 'sfx') => {
    const r = el.querySelector(`#${id}`) as HTMLInputElement;
    r.oninput = () => {
      unlock();
      r.style.setProperty('--v', `${r.value}%`);
      setVolume({ [key]: Number(r.value) / 100 });
    };
    r.onchange = () => key === 'sfx' && sound.tap();
  };
  rng('smusic', 'music');
  rng('ssfx', 'sfx');
  (el.querySelector('#shelp') as HTMLButtonElement).onclick = () => {
    close();
    showHowto();
  };
  (el.querySelector('#stut') as HTMLButtonElement).onclick = () => {
    replayTutorial();
    sound.breakEven();
    toast('The coach will walk you through your next bag.');
    close();
  };
}
