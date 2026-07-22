import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './relativeTime';

const base = new Date('2026-07-22T14:00:00+09:00').getTime();

describe('formatRelativeTime', () => {
  it('방금 전은 방금으로 표시한다', () => {
    expect(formatRelativeTime('2026-07-22T14:00:00+09:00', base + 2_000)).toBe('방금');
  });

  it('1분 미만은 초로 표시한다', () => {
    expect(formatRelativeTime('2026-07-22T14:00:00+09:00', base + 42_000)).toBe('42초 전');
  });

  it('1분 이상은 분으로 표시한다', () => {
    expect(formatRelativeTime('2026-07-22T14:00:00+09:00', base + 125_000)).toBe('2분 전');
  });

  it('1시간 이상은 시간으로 표시한다', () => {
    expect(formatRelativeTime('2026-07-22T14:00:00+09:00', base + 7_500_000)).toBe('2시간 전');
  });

  it('잘못된 시각 문자열은 빈 문자열을 반환한다', () => {
    expect(formatRelativeTime('not-a-date', base)).toBe('');
  });
});
