export type AppConfig = {
  port: number;
  seoulApiKey: string;
  seoulBaseUrl: string;
  /** 시간표 API는 실시간 API와 호스트가 다르다(열린데이터광장 일반 API). */
  seoulTimetableBaseUrl: string;
  cacheTtlMs: number;
  staleMaxAgeMs: number;
};

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`환경변수 ${key}가 설정되지 않았습니다. .env를 확인하세요.`);
  }
  return value;
}

function numberOr(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const value = Number(env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: numberOr(env, 'PORT', 3000),
    seoulApiKey: required(env, 'SEOUL_OPEN_API_KEY'),
    seoulBaseUrl:
      env.SEOUL_SUBWAY_REALTIME_BASE_URL?.trim() || 'http://swopenapi.seoul.go.kr/api/subway',
    seoulTimetableBaseUrl:
      env.SEOUL_SUBWAY_TIMETABLE_BASE_URL?.trim() || 'http://openapi.seoul.go.kr:8088',
    cacheTtlMs: numberOr(env, 'SUBWAY_CACHE_TTL_MS', 10_000),
    staleMaxAgeMs: numberOr(env, 'SUBWAY_STALE_MAX_AGE_MS', 300_000),
  };
}
