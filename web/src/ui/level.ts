// Rival difficulty the player picks: easy rivals give up sooner, hard ones push further.
export type Level = 'easy' | 'normal' | 'hard';
export const LEVEL_INFO: Record<Level, { name: string; hint: string }> = {
  easy: { name: 'Easy', hint: 'Rivals give up sooner' },
  normal: { name: 'Normal', hint: 'Rivals bid what they think it is worth' },
  hard: { name: 'Hard', hint: 'Rivals push past their estimate' },
};
const KEY = 'fc:level';

export function getLevel(): Level {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'easy' || v === 'hard' ? v : 'normal';
  } catch {
    return 'normal';
  }
}
export function setLevel(l: Level) {
  try {
    localStorage.setItem(KEY, l);
  } catch {}
}

/** Three-way picker. Call wireLevel on its container after inserting it. */
export function levelPicker(): string {
  const cur = getLevel();
  return `<div class="level-pick" role="radiogroup" aria-label="Rival difficulty">${(Object.keys(LEVEL_INFO) as Level[])
    .map((l) => `<button role="radio" aria-checked="${l === cur}" class="${l === cur ? 'on' : ''}" data-level="${l}"><b>${LEVEL_INFO[l].name}</b><small>${LEVEL_INFO[l].hint}</small></button>`)
    .join('')}</div>`;
}
export function wireLevel(root: ParentNode, onPick?: (l: Level) => void) {
  const btns = [...root.querySelectorAll<HTMLButtonElement>('.level-pick button')];
  btns.forEach((b) =>
    (b.onclick = () => {
      const l = b.dataset.level as Level;
      setLevel(l);
      btns.forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-checked', String(x === b));
      });
      onPick?.(l);
    }),
  );
}
