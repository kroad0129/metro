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
 * 방향은 updnLine이 아닌 statnFid(열차의 이전지하철역ID) vs statnTid(열차의 다음지하철역ID)로
 * 판단한다. 이 둘은 열차 자신의 진행 방향 기준이므로 열차가 조회한 역(statnId)에 정차 중이어도
 * (statnTid == statnId) 서로 같아지는 일이 없다 — statnId(조회한 역) 자체는 방향 판단에 쓰지
 * 않는다. updnLine은 이 API에서 신뢰할 수 없다 (seoul-api.types.ts 참고). 이 노선의 역 ID는
 * 1009000900 + order로 순번화되어 있으므로, statnTid가 statnFid보다 작으면 order가
 * 감소하는 방향(UP=개화 방면), 크면 order가 증가하는 방향(DOWN)이다.
 */
function toDirection(statnFid: unknown, statnTid: unknown): DirectionId | null {
  const statnFidStr = asString(statnFid);
  const statnTidStr = asString(statnTid);
  if (!statnFidStr || !statnTidStr) return null;

  const fid = Number(statnFidStr);
  const tid = Number(statnTidStr);
  if (!Number.isFinite(fid) || !Number.isFinite(tid) || tid === fid) return null;

  return tid < fid ? 'UP' : 'DOWN';
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

/**
 * ordkey에서 "조회한 역까지 몇 정거장 남았는지"를 꺼낸다.
 * 벤더 명세상 구조: 상하행(1자리) + 순번(1자리) + 거리(3자리) + 목적지 + 급행여부(1자리).
 * 예: "01003개화0" → 3정거장. 역명 매칭으로 거리를 유추하는 것보다 정확하고 견고하다.
 * 형식이 어긋나면 null — 호출부가 역명 기반으로 대체한다.
 */
export function toStationsAway(ordkey: unknown): number | null {
  const value = asString(ordkey);
  if (!value || value.length < 5) return null;
  const digits = value.slice(2, 5);
  if (!/^\d{3}$/.test(digits)) return null;
  return Number(digits);
}

/**
 * recptnDt("2026-07-23 13:57:02")를 ISO 문자열로. 서울시 값이므로 KST(+09:00)로 해석한다.
 * barvlDt는 "이 시각 기준" 추정치라, 이후 흐른 만큼 빼서 써야 한다(벤더 명세의 명시적 지침).
 */
export function toRecptnAtIso(recptnDt: unknown): string | null {
  const value = asString(recptnDt)?.trim();
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+09:00`;
  return Number.isFinite(new Date(iso).getTime()) ? iso : null;
}

function mapItem(
  item: unknown,
  index: number,
  expectedLineId: string,
): RawTrain | null {
  if (!isRecord(item)) return null;

  const subwayId = asString(item.subwayId);
  if (subwayId !== expectedLineId) return null;

  const directionId = toDirection(item.statnFid, item.statnTid);
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
    stationsAway: toStationsAway(item.ordkey),
    recptnAt: toRecptnAtIso(item.recptnDt),
  };
}

/**
 * 서울시 도착정보 응답을 내부 도메인 형식으로 변환한다.
 * 조회는 역 "이름"으로 이뤄지므로 환승역에서는 여러 노선의 열차가 한 응답에 섞여 온다.
 * expectedLineId(subwayId, 예: 9호선 "1009")와 일치하지 않는 행은 버린다. subwayId가
 * 없는 행도 노선을 알 수 없으므로 버린다.
 * 외부 API 응답이므로 모든 필드가 미검증이다: 최상위 값이 객체가 아니거나, realtimeArrivalList가
 * 배열이 아니거나, 배열 원소가 null/객체가 아니거나 해석 불가한 경우 조용히 건너뛴다(빈 배열/원소 스킵).
 */
export function mapArrivalResponse(
  raw: unknown,
  expectedLineId: string,
): RawTrain[] {
  if (!isRecord(raw)) return [];

  const list = raw.realtimeArrivalList;
  if (!Array.isArray(list)) return [];

  return list
    .map((item, index) => mapItem(item, index, expectedLineId))
    .filter((train): train is RawTrain => train !== null);
}
