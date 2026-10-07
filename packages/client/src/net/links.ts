/**
 * Линкове за покана в стая: `?room=ID` в адреса на играта.
 * Отделно от NetGame, за да не тегли мрежовата библиотека там, където не трябва.
 */

/** Линк за покана към стаята (същата страница + ?room=ID). */
export function inviteLink(roomId: string): string {
  return `${location.origin}${location.pathname}?room=${encodeURIComponent(roomId)}`;
}

/** Стаята от адреса (?room=ID) или null. */
export function roomFromUrl(): string | null {
  const id = new URLSearchParams(location.search).get('room')?.trim();
  return id ? id.slice(0, 64) : null;
}

/** Маха ?room=ID от адреса (без презареждане), за да не влизаме пак в същата стая след презареждане. */
export function clearRoomFromUrl(): void {
  const params = new URLSearchParams(location.search);
  if (!params.has('room')) return;
  params.delete('room');
  const q = params.toString();
  history.replaceState(history.state, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
}
