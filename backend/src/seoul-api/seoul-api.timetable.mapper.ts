import { DirectionId } from '../lines/types';

/**
 * 역별 시간표(SearchSTNTimeTableByIDService)의 한 출발.
 *
 * 시간은 "운행일 기준 초"다 — 서울시 시간표는 자정을 넘는 열차를 "24:48:25"처럼 24시+로
 * 표기한다(실측: 증미 평일 막차 24:55). 즉 하루 시간표 안에서 값이 단조 증가하고,
 * 심야(새벽 1시 등)는 전날 운행일의 24시+로 비교하면 된다.
 */
export type ScheduleEntry = {
  departureServiceSeconds: number;
  directionId: DirectionId;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** "24:48:25" → 89305. 운행일 표기라 시(hour)가 24를 넘을 수 있다. 해석 불가면 null. */
export function toServiceSeconds(time: unknown): number | null {
  const value = asString(time)?.trim();
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return seconds > 0 ? seconds : null; // "00:00:00"은 출발 없음(당역 종착)으로 본다
}

/**
 * 시간표 행들을 출발 목록으로 변환한다. 9호선 역 코드는 4100 + 역 순번이므로
 * 종착역 코드가 조회 역 코드보다 작으면 UP(개화 방면), 크면 DOWN이다.
 * 당역 종착(종착역 == 조회 역, 또는 출발 시각 없음)은 출발이 아니므로 버린다.
 */
export function mapTimetableRows(rows: unknown, stationCd: string): ScheduleEntry[] {
  if (!Array.isArray(rows)) return [];
  const cd = Number(stationCd);
  if (!Number.isFinite(cd)) return [];

  const entries: ScheduleEntry[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;

    const dest = Number(asString(row.DESTSTATION));
    if (!Number.isFinite(dest) || dest === cd) continue;

    const seconds = toServiceSeconds(row.LEFTTIME) ?? toServiceSeconds(row.ARRIVETIME);
    if (seconds === null) continue;

    entries.push({
      departureServiceSeconds: seconds,
      directionId: dest < cd ? 'UP' : 'DOWN',
    });
  }

  return entries.sort((a, b) => a.departureServiceSeconds - b.departureServiceSeconds);
}
