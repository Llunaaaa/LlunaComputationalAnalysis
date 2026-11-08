export type FullscreenListener = (isFullscreen: boolean) => void;

let isAppFullscreen = document.fullscreenElement === document.documentElement;
const listeners = new Set<FullscreenListener>();

function syncState(): void {
  const next = document.fullscreenElement === document.documentElement;
  if (next === isAppFullscreen) return;
  isAppFullscreen = next;
  for (const listener of listeners) listener(isAppFullscreen);
}

function reportFailure(action: string, caught: unknown): void {
  console.error(`Unable to ${action} application fullscreen mode.`, caught);
}

document.addEventListener('fullscreenchange', syncState);

export function isFullscreen(): boolean {
  return isAppFullscreen;
}

export function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch((caught: unknown) => reportFailure('exit', caught));
    return;
  }
  if (!document.documentElement.requestFullscreen) {
    reportFailure('enter', new Error('Fullscreen API is unavailable'));
    return;
  }
  void document.documentElement.requestFullscreen().catch((caught: unknown) => reportFailure('enter', caught));
}

export function subscribeFullscreen(listener: FullscreenListener): () => void {
  listeners.add(listener);
  listener(isAppFullscreen);
  return () => listeners.delete(listener);
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'F11') return;
  event.preventDefault();
  toggleFullscreen();
}

document.addEventListener('keydown', handleKeyDown);
