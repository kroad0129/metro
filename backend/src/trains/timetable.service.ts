import { Injectable, Logger } from '@nestjs/common';
import { DirectionId, Station } from '../lines/types';
import { SeoulApiClient } from '../seoul-api/seoul-api.client';
import { mapTimetableRows, ScheduleEntry } from '../seoul-api/seoul-api.timetable.mapper';

/** 열차가 없는 방향에 보여줄 시간표 기준 다음 출발. */
export type NextSchedule = {
  /** 출발 시각(KST ISO). */
  departureAt: string;
  /** 오늘 운행이 끝나 다음 운행일의 첫차를 안내하는 경우 true. */
  firstOfDay: boolean;
};

const KST_OFFSET_MS = 9 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
/** 이 시각(KST)까지는 전날 운행일로 본다 — 시간표가 자정 넘은 열차를 24시+로 표기하므로. */
const SERVICE_DAY_CUTOFF_SECONDS = 3 * 3600;
const TABLE_TTL_MS = 24 * 3600 * 1000;

/** 9호선 시간표 역 코드 = 4100 + 역 순번 (개화 4101 ~ 중앙보훈병원 4138, 실측 검증). */
function timetableCodeOf(station: Station): string {
  return String(4100 + station.order);
}

function weekTagOf(kstDay: number): '1' | '2' | '3' {
  if (kstDay === 0) return '3'; // 일요일 → 휴일 시간표. 법정공휴일 감지는 미지원(문서 참고).
  if (kstDay === 6) return '2';
  return '1';
}

function toKstIso(epochMs: number): string {
  const kst = new Date(epochMs + KST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}` +
    `T${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(kst.getUTCSeconds())}+09:00`
  );
}

/**
 * 역별 시간표에서 "다음 출발"을 찾는다 — 실시간 API에 접근 중인 열차가 하나도 없을 때
 * (심야·막차 이후·배차 간격이 긴 시간대) 화면이 아무 정보도 못 주는 구멍을 메운다.
 *
 * 시간표는 하루 단위로 캐시한다(개정은 드물다). 시간 축은 "운행일 기준"이다:
 * 시간표가 자정 넘은 열차를 24:48처럼 표기하므로, KST 새벽 3시 전까지는 전날 운행일의
 * 24시+ 시각으로 비교한다. 오늘 운행일에 남은 출발이 없으면 다음 운행일의 첫차를 준다.
 */
@Injectable()
export class TimetableService {
  private readonly logger = new Logger(TimetableService.name);
  private readonly tables = new Map<string, { entries: ScheduleEntry[]; storedAt: number }>();

  constructor(private readonly client: SeoulApiClient) {}

  async nextDeparture(
    station: Station,
    directionId: DirectionId,
    nowMs: number = Date.now(),
  ): Promise<NextSchedule | null> {
    const kst = new Date(nowMs + KST_OFFSET_MS);
    const secondsOfDay =
      kst.getUTCHours() * 3600 + kst.getUTCMinutes() * 60 + kst.getUTCSeconds();
    const lateNight = secondsOfDay < SERVICE_DAY_CUTOFF_SECONDS;

    // 운행일의 KST 자정(epoch). 새벽이면 전날이 운행일이다.
    const kstMidnightEpochMs =
      Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - KST_OFFSET_MS;
    const serviceMidnightMs = kstMidnightEpochMs - (lateNight ? DAY_MS : 0);
    const nowServiceSeconds = (nowMs - serviceMidnightMs) / 1000;

    // 오늘 운행일에서 다음 출발을 찾고, 없으면 다음 운행일의 첫차.
    const today = await this.tableFor(station, this.weekTagAt(serviceMidnightMs));
    const upcoming = today.find(
      (e) => e.directionId === directionId && e.departureServiceSeconds > nowServiceSeconds,
    );
    if (upcoming) {
      return {
        departureAt: toKstIso(serviceMidnightMs + upcoming.departureServiceSeconds * 1000),
        firstOfDay: false,
      };
    }

    const nextMidnightMs = serviceMidnightMs + DAY_MS;
    const tomorrow = await this.tableFor(station, this.weekTagAt(nextMidnightMs));
    const first = tomorrow.find((e) => e.directionId === directionId);
    if (!first) return null;
    return {
      departureAt: toKstIso(nextMidnightMs + first.departureServiceSeconds * 1000),
      firstOfDay: true,
    };
  }

  private weekTagAt(serviceMidnightMs: number): '1' | '2' | '3' {
    // 정오 시점으로 요일을 읽어 자정 경계의 오차를 피한다.
    return weekTagOf(new Date(serviceMidnightMs + KST_OFFSET_MS + DAY_MS / 2).getUTCDay());
  }

  private async tableFor(station: Station, weekTag: '1' | '2' | '3'): Promise<ScheduleEntry[]> {
    const stationCd = timetableCodeOf(station);
    const key = `${stationCd}:${weekTag}`;
    const cached = this.tables.get(key);
    if (cached && Date.now() - cached.storedAt < TABLE_TTL_MS) return cached.entries;

    // 방향 축(INOUT) 두 값을 합쳐야 전체 시간표다.
    const [a, b] = await Promise.all([
      this.client.fetchStationTimetable(stationCd, weekTag, '1'),
      this.client.fetchStationTimetable(stationCd, weekTag, '2'),
    ]);
    const entries = mapTimetableRows([...a, ...b], stationCd);
    if (entries.length === 0) {
      this.logger.warn(`시간표가 비어 있습니다 (역 ${stationCd}, 주 ${weekTag})`);
    }
    this.tables.set(key, { entries, storedAt: Date.now() });
    return entries;
  }
}
