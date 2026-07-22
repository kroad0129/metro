import { DirectionId } from '../lines/types';
import { RawTrain, TrainStatus, TrainType } from '../trains/types';

const STATUS_BY_ARVL_CD: Record<string, TrainStatus> = {
  '0': 'APPROACHING', // 진입
  '1': 'ARRIVED', // 도착
  '2': 'DEPARTED', // 출발
  '3': 'DEPARTED', // 전역출발
  '4': 'APPROACHING', // 전역진입
  '5': 'ARRIVED', // 전역도착
  '99': 'TRAVELING', // 운행중
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * 방향은 updnLine이 아닌 statnId(조회한 역) vs statnTid(진행 방향의 다음 역)로 판단한다.
 * updnLine은 이 API에서 신뢰할 수 없다 (seoul-api.types.ts 참고). 이 노선의 역 ID는
 * 1009000900 + order로 순번화되어 있으므로, statnTid가 statnId보다 작으면 order가
 * 감소하는 방향(UP=개화 방면), 크면 order가 증가하는 방향(DOWN)이다.
 */
function toDirection(statnId: unknown, statnTid: unknown): DirectionId | null {
  const statnIdStr = asString(statnId);
  const statnTidStr = asString(statnTid);
  if (!statnIdStr || !statnTidStr) return null;

  const id = Number(statnIdStr);
  const tid = Number(statnTidStr);
  if (!Number.isFinite(id) || !Number.isFinite(tid) || tid === id) return null;

  return tid < id ? 'UP' : 'DOWN';
}

function toTrainType(btrainSttus: unknown): TrainType {
  const value = asString(btrainSttus);
  if (!value) return 'LOCAL';
  return value.includes('급행') || value.includes('특급') ? 'EXPRESS' : 'LOCAL';
}

function toRemainingSeconds(barvlDt: unknown): number | null {
  const value = asString(barvlDt);
  if (value === undefined) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return seconds;
}

function mapItem(item: unknown, index: number): RawTrain | null {
  if (!isRecord(item)) return null;

  const directionId = toDirection(item.statnId, item.statnTid);
  const currentStationName = asString(item.arvlMsg3)?.trim();
  if (!directionId || !currentStationName) return null;

  const arvlCd = asString(item.arvlCd) ?? '';
  const trainId =
    asString(item.btrainNo)?.trim() ||
    `${directionId}-${currentStationName}-${index}`;

  return {
    trainId,
    trainType: toTrainType(item.btrainSttus),
    currentStationName,
    remainingSeconds: toRemainingSeconds(item.barvlDt),
    status: STATUS_BY_ARVL_CD[arvlCd] ?? 'TRAVELING',
    directionId,
  };
}

/**
 * 서울시 도착정보 응답을 내부 도메인 형식으로 변환한다.
 * 외부 API 응답이므로 모든 필드가 미검증이다: 최상위 값이 객체가 아니거나, realtimeArrivalList가
 * 배열이 아니거나, 배열 원소가 null/객체가 아니거나 해석 불가한 경우 조용히 건너뛴다(빈 배열/원소 스킵).
 */
export function mapArrivalResponse(raw: unknown): RawTrain[] {
  if (!isRecord(raw)) return [];

  const list = raw.realtimeArrivalList;
  if (!Array.isArray(list)) return [];

  return list
    .map((item, index) => mapItem(item, index))
    .filter((train): train is RawTrain => train !== null);
}
