/** Shared theme helpers used across components. */

function chevronSvg(hexColor: string): string {
  const enc = hexColor.replace('#', '%23');
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='${enc}' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`;
}

export const CHEVRON_DARK  = chevronSvg('#7878a8');
export const CHEVRON_LIGHT = chevronSvg('#808098');

export function chevron(theme: 'dark' | 'light'): string {
  return theme === 'light' ? CHEVRON_LIGHT : CHEVRON_DARK;
}
