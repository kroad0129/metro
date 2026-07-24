import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../common/cache.service';
import { LinesService } from '../lines/lines.service';
import { DirectionId, Station } from '../lines/types';
import { SeoulApiClient } from '../seoul-api/seoul-api.client';
import { TimetableService } from './timetable.service';
import { LineNotFoundError, StationNotFoundError } from './trains.errors';
import { DirectionBlock, RawTrain, Train, TrainsResponse } from './types';

/** 노선별 방향 이름. 노선을 추가할 때 여기에 한 줄을 더한다. */
const DIRECTION_NAMES: Record<string, Record<DirectionId, string>> = {
  '9': { UP: '개화 방면', DOWN: '중앙보훈병원 방면' },
};

const DIRECTION_ORDER: DirectionId[] = ['UP', 'DOWN'];

@Injectable()
export class TrainsService {
  private readonly logger = new Logger(TrainsService.name);

  constructor(
    private readonly lines: LinesService,
    private readonly cache: CacheService,
    private readonly client: SeoulApiClient,
    private readonly timetable: TimetableService,
  ) {}

  async getTrains(lineId: string, stationId: string): Promise<TrainsResponse> {
    const line = this.lines.getLine(lineId);
    if (!line) throw new LineNotFoundError(lineId);

    const station = this.lines.findStationById(lineId, stationId);
    if (!station) throw new StationNotFoundError(stationId);

    const key = `trains:${lineId}:${stationId}`;

    const fresh = this.cache.get<RawTrain[]>(key);
    if (fresh) {
      return this.build(line.lineId, line.lineName, station, fresh, new Date().toISOString(), false);
    }

    try {
      const raws = await this.client.fetchStationArrivals(station.name, line.externalLineId);
      this.cache.set(key, raws);
      return this.build(line.lineId, line.lineName, station, raws, new Date().toISOString(), false);
    } catch (error) {
      const stale = this.cache.getStale<RawTrain[]>(key);
      if (!stale) throw error;

      this.logger.warn(`외부 API 실패, stale 데이터로 응답합니다 (${station.name})`);
      return this.build(
        line.lineId,
        line.lineName,
        station,
        stale.value,
        new Date(stale.storedAt).toISOString(),
        true,
      );
    }
  }

  private async build(
    lineId: string,
    lineName: string,
    station: Station,
    raws: RawTrain[],
    updatedAt: string,
    stale: boolean,
  ): Promise<TrainsResponse> {
    const names = DIRECTION_NAMES[lineId] ?? { UP: '상행', DOWN: '하행' };

    const directions: DirectionBlock[] = await Promise.all(
      DIRECTION_ORDER.map(async (directionId) => {
        const trains = raws
          .filter((raw) => raw.directionId === directionId)
          .map((raw) => this.toTrain(lineId, raw, station))
          .filter((train): train is Train => train !== null)
          .sort(byArrivalSoonest);

        const block: DirectionBlock = {
          directionId,
          directionName: names[directionId],
          trains,
        };

        // 접근 중인 열차가 없으면(심야·막차 이후) 시간표에서 다음 출발을 채운다.
        // 시간표 조회 실패가 본 응답을 막아서는 안 된다 — null로 두고 경고만 남긴다.
        if (trains.length === 0) {
          try {
            block.nextSchedule = await this.timetable.nextDeparture(station, directionId);
          } catch (error) {
            this.logger.warn(`시간표 조회 실패 (${station.name} ${directionId}): ${String(error)}`);
            block.nextSchedule = null;
          }
        }

        return block;
      }),
    );

    return {
      line: { id: lineId, name: lineName },
      station,
      directions,
      updatedAt,
      stale,
    };
  }

  private toTrain(lineId: string, raw: RawTrain, station: Station): Train | null {
    const current = this.lines.findStationByName(lineId, raw.currentStationName);
    if (!current) {
      // 역명 표기가 예상과 다르면 여기서 드러난다(스펙 2절 2번).
      this.logger.warn(`역명 매칭 실패: "${raw.currentStationName}" (노선 ${lineId})`);
      return null;
    }

    // 상류 API는 선택한 역에 서지 않는 급행을 이미 걸러서 내려준다(스펙 2절 2번).
    // 여기서 isExpressStop으로 다시 거르면, 그 값이 틀렸을 때 실제로 오는 급행을
    // 조용히 삭제하는 최악의 실패로 이어지므로 필터링하지 않는다.

    return {
      trainId: raw.trainId,
      trainType: raw.trainType,
      currentStation: current,
      remainingSeconds: raw.remainingSeconds,
      status: raw.status,
      // ordkey가 없거나 형식이 어긋나면 역 순번 차이로 대체한다.
      stationsAway: raw.stationsAway ?? Math.abs(station.order - current.order),
      recptnAt: raw.recptnAt,
    };
  }
}

/** 도착이 빠른 순. 시간을 모르는 열차는 맨 뒤로 보낸다. */
function byArrivalSoonest(a: Train, b: Train): number {
  const left = a.remainingSeconds ?? Number.POSITIVE_INFINITY;
  const right = b.remainingSeconds ?? Number.POSITIVE_INFINITY;
  return left - right;
}
