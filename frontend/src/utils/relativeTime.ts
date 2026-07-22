export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return '';

  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return '방금';
  if (seconds < 60) return `${seconds}초 전`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  return `${Math.floor(seconds / 3600)}시간 전`;
}
