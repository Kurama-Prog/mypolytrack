export function qs<T extends Element>(selector: string, root: ParentNode = document): T {
  const found = root.querySelector(selector);
  if (!found) throw new Error(`[ui] element not found: ${selector}`);
  return found as T;
}

export function qsa<T extends Element>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll(selector)) as T[];
}

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  html = ''
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

function pad(value: number, size: number): string {
  return Math.floor(Math.abs(value)).toString().padStart(size, '0');
}

/** mm:ss.mmm — the standard PolyTrack style time readout. */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}`;
}

export function formatDelta(ms: number): string {
  const sign = ms >= 0 ? '+' : '-';
  const value = Math.abs(ms);
  const seconds = Math.floor(value / 1000);
  const millis = Math.floor(value % 1000);
  return `${sign}${seconds}.${pad(millis, 3)}`;
}

export function formatSpeed(speed: number): string {
  return Math.round(speed * 3.6).toString();
}

export function percent(value: number, min: number, max: number): number {
  return ((value - min) / (max - min)) * 100;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
