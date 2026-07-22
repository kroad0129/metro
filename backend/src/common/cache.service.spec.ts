import { CacheService } from './cache.service';

describe('CacheService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('저장한 값을 TTL 이내에 반환한다', () => {
    const cache = new CacheService(10_000, 300_000);
    cache.set('k', { n: 1 });
    expect(cache.get<{ n: number }>('k')).toEqual({ n: 1 });
  });

  it('없는 키는 null을 반환한다', () => {
    expect(new CacheService(10_000, 300_000).get('missing')).toBeNull();
  });

  it('TTL이 지나면 get은 null을 반환한다', () => {
    const cache = new CacheService(10_000, 300_000);
    cache.set('k', { n: 1 });
    jest.advanceTimersByTime(10_001);
    expect(cache.get('k')).toBeNull();
  });

  it('TTL이 지나도 getStale은 값과 저장 시각을 반환한다', () => {
    const cache = new CacheService(10_000, 300_000);
    cache.set('k', { n: 1 });
    const storedAt = Date.now();
    jest.advanceTimersByTime(10_001);
    const stale = cache.getStale<{ n: number }>('k');
    expect(stale?.value).toEqual({ n: 1 });
    expect(stale?.storedAt).toBe(storedAt);
  });

  it('staleMaxAge를 넘으면 getStale도 null을 반환한다', () => {
    const cache = new CacheService(10_000, 300_000);
    cache.set('k', { n: 1 });
    jest.advanceTimersByTime(300_001);
    expect(cache.getStale('k')).toBeNull();
  });

  it('같은 키에 다시 저장하면 값과 시각이 갱신된다', () => {
    const cache = new CacheService(10_000, 300_000);
    cache.set('k', { n: 1 });
    jest.advanceTimersByTime(10_001);
    cache.set('k', { n: 2 });
    expect(cache.get<{ n: number }>('k')).toEqual({ n: 2 });
  });

  it('키가 다르면 서로 영향을 주지 않는다', () => {
    const cache = new CacheService(10_000, 300_000);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
  });
});
