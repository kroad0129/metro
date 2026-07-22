type Entry = { value: unknown; storedAt: number };

/**
 * 인메모리 TTL 캐시. 프로세스 메모리에만 존재하며 재시작 시 사라져도 무방하다.
 *
 * get()은 TTL 이내의 신선한 값만 준다 — 새로고침 연타를 막는 용도.
 * getStale()은 TTL이 지났어도 staleMaxAge 이내면 값을 준다 — 외부 API 실패 시
 * 마지막 정상 데이터를 보여주는 용도(스펙 6.2절).
 */
export class CacheService {
  private readonly store = new Map<string, Entry>();

  constructor(
    private readonly ttlMs: number,
    private readonly staleMaxAgeMs: number,
  ) {}

  get size(): number {
    return this.store.size;
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, { value, storedAt: Date.now() });
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.storedAt > this.ttlMs) return null;
    return entry.value as T;
  }

  getStale<T>(key: string): { value: T; storedAt: number } | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.storedAt > this.staleMaxAgeMs) {
      this.store.delete(key);
      return null;
    }
    return { value: entry.value as T, storedAt: entry.storedAt };
  }
}
