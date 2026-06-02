export const GLYPHSET = [
  '◆', '◇', '○', '●', '▣', '▢', '✕', '✦', '⬡', '⬢',
  '⊕', '⊗', '⧉', '▲', '△', '►', '◄', '⌖', '⍟', '✳', '❋', '⧐', '⌬', '⛬',
];

export function hex(n = 4): string {
  let s = '';
  const c = '0123456789ABCDEF';
  for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * 16)];
  return s;
}

export function readVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
