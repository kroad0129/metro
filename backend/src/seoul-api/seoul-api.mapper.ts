import { DirectionId } from '../lines/types';
import { RawTrain, TrainStatus, TrainType } from '../trains/types';
import { SeoulArrivalItem, SeoulArrivalResponse } from './seoul-api.types';

const STATUS_BY_ARVL_CD: Record<string, TrainStatus> = {
  '0': 'APPROACHING',  // 진입
  '1': 'ARRIVED',      // 도착
  '2': 'DEPARTED',     // 출발
  '3': 'DEPARTED',     // 전역출발
  '4': 'APPROACHING',  // 전역진입
  '5': 'ARRIVED',      // 전역도착
  '99': 'TRAVELING',   // 운행중
};

function toDirection(updnLine: string | undefined): DirectionId | null {
  if (!updnLine) return null;
  if (updnLine.includes('상행')) return 'UP';
  if (updnLine.includes('하행')) return 'DOWN';
  return null;
}

function toTrainType(btrainSttus: string | undefined): TrainType {
  if (!btrainSttus) return 'LOCAL';
  return btrainSttus.includes('급행') || btrainSttus.includes('특급') ? 'EXPRESS' : 'LOCAL';
}

function toRemainingSeconds(barvlDt: string | undefined): number | null {
  const seconds = Number(barvlDt);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return seconds;
}

function mapItem(item: SeoulArrivalItem, index: number): RawTrain | null {
  const directionId = toDirection(item.updnLine);
  const currentStationName = item.arvlMsg3?.trim();
  if (!directionId || !currentStationName) return null;

  return {
    trainId: item.btrainNo?.trim() || `${directionId}-${currentStationName}-${index}`,
    trainType: toTrainType(item.btrainSttus),
    currentStationName,
    remainingSeconds: toRemainingSeconds(item.barvlDt),
    status: STATUS_BY_ARVL_CD[item.arvlCd ?? ''] ?? 'TRAVELING',
    directionId,
  };
}

/** 서울시 도착정보 응답을 내부 도메인 형식으로 변환한다. 해석 불가한 항목은 조용히 버린다. */
export function mapArrivalResponse(raw: SeoulArrivalResponse): RawTrain[] {
  const list = raw.realtimeArrivalList ?? [];
  return list
    .map((item, index) => mapItem(item, index))
    .filter((train): train is RawTrain => train !== null);
}
