import type { DirectionBlock, Station, Train } from '../types/subway';

/**
 * 목업 시나리오 — 실호출 없이 화면의 모든 상태를 조합해 보기 위한 가짜 데이터.
 *
 * 실측한 값의 모양을 그대로 흉내낸다: 전역 barvlDt ~95초, 전전역 ~220초, 진입 ~20초,
 * 바닥(floorSeconds)은 다음 구간 값. 시간은 baseMs(페이지 연 시각) 기준으로 계산해
 * 화면의 초 단위 틱(useNow)에 맞춰 실제처럼 흐른다.
 */

export const MOCK_STATIONS: Station[] = [
  ['1009000901', '개화', 1, false],
  ['1009000902', '김포공항', 2, true],
  ['1009000903', '공항시장', 3, false],
  ['1009000904', '신방화', 4, false],
  ['1009000905', '마곡나루', 5, false],
  ['1009000906', '양천향교', 6, false],
  ['1009000907', '가양', 7, true],
  ['1009000908', '증미', 8, false],
  ['1009000909', '등촌', 9, false],
  ['1009000910', '염창', 10, true],
  ['1009000911', '신목동', 11, false],
  ['1009000912', '선유도', 12, false],
  ['1009000913', '당산', 13, true],
].map(([stationId, name, order, isExpressStop]) => ({
  stationId: stationId as string,
  name: name as string,
  order: order as number,
  isExpressStop: isExpressStop as boolean,
}));

export const MOCK_SELECTED = MOCK_STATIONS.find((s) => s.name === '증미')!;

function st(name: string): Station {
  return MOCK_STATIONS.find((s) => s.name === name)!;
}

type Overrides = Partial<Train> & { trainId: string; currentStation: Station };

function train(over: Overrides): Train {
  return {
    trainType: 'LOCAL',
    remainingSeconds: null,
    status: 'TRAVELING',
    positionRatio: 0.5,
    stationsAway: null,
    recptnAt: null,
    ...over,
  };
}

type Effect = {
  up?: Train[];
  down?: Train[];
  /** undefined = 건드리지 않음, null = 시간표 조회 실패 흉내. */
  upSchedule?: DirectionBlock['nextSchedule'];
  downSchedule?: DirectionBlock['nextSchedule'];
};

export type Scenario = {
  id: string;
  label: string;
  group: string;
  build(baseMs: number): Effect;
};

export const SCENARIOS: Scenario[] = [
  // ── 역 위 (점) ─────────────────────────────────────────────
  {
    id: '정차-전역',
    label: '전역 정차 — 등촌에 서 있음 ("정차")',
    group: '역 위',
    build: (base) => ({
      up: [
        train({
          trainId: 'M정차1',
          currentStation: st('등촌'),
          status: 'ARRIVED',
          stationsAway: 1,
          remainingSeconds: 60,
          segmentStartedAtMs: base - 35_000,
          floorSeconds: 19,
        }),
      ],
    }),
  },
  {
    id: '진입-전역',
    label: '전역 진입 — 구간 마지막 ⅓ ("진입")',
    group: '구간 이동',
    build: (base) => ({
      up: [
        train({
          trainId: 'M진입1',
          currentStation: st('등촌'),
          status: 'APPROACHING',
          stationsAway: 1,
          remainingSeconds: 95,
          segmentStartedAtMs: base - 5_000,
          floorSeconds: 19,
        }),
      ],
    }),
  },
  {
    id: '곧도착',
    label: '내 역 곧 도착 — 마지막 ⅓ + 문구',
    group: '구간 이동',
    build: (base) => ({
      up: [
        train({
          trainId: 'M곧도착1',
          currentStation: st('증미'),
          status: 'APPROACHING',
          stationsAway: 0,
          remainingSeconds: 20,
          segmentStartedAtMs: base - 3_000,
          floorSeconds: 0,
        }),
      ],
    }),
  },
  {
    id: '도착',
    label: '내 역 도착',
    group: '역 위',
    build: () => ({
      up: [
        train({
          trainId: 'M도착1',
          currentStation: st('증미'),
          status: 'ARRIVED',
          stationsAway: 0,
        }),
      ],
    }),
  },

  // ── 구간 이동 (화살표) ─────────────────────────────────────
  {
    id: '막출발',
    label: '막 출발 — 구간 첫 ⅓, "출발" 표시',
    group: '구간 이동',
    build: (base) => ({
      up: [
        train({
          trainId: 'M출발1',
          currentStation: st('등촌'),
          status: 'DEPARTED',
          stationsAway: 1,
          remainingSeconds: 95,
          segmentStartedAtMs: base - 45_000,
          floorSeconds: 19,
          moveStartMs: base - 5_000,
          moveStartRemainingSeconds: 60,
        }),
      ],
    }),
  },
  {
    id: '이동-전역',
    label: '이동 중 — 전역→내 역',
    group: '구간 이동',
    build: (base) => ({
      up: [
        train({
          trainId: 'M이동1',
          currentStation: st('등촌'),
          status: 'TRAVELING',
          stationsAway: 1,
          remainingSeconds: 95,
          segmentStartedAtMs: base - 30_000,
          floorSeconds: 19,
        }),
      ],
    }),
  },
  {
    id: '이동-전전역',
    label: '이동 중 — 전전역→전역',
    group: '구간 이동',
    build: (base) => ({
      up: [
        train({
          trainId: 'M이동2',
          currentStation: st('염창'),
          status: 'TRAVELING',
          stationsAway: 2,
          remainingSeconds: 220,
          segmentStartedAtMs: base - 20_000,
          floorSeconds: 95,
        }),
      ],
    }),
  },
  {
    id: '지연',
    label: '지연 — 추정 소요 초과, 배지',
    group: '구간 이동',
    build: (base) => ({
      up: [
        train({
          trainId: 'M지연1',
          currentStation: st('등촌'),
          status: 'TRAVELING',
          stationsAway: 1,
          remainingSeconds: 95,
          segmentStartedAtMs: base - 150_000,
          floorSeconds: 19,
        }),
      ],
    }),
  },

  // ── 급행 (색으로 구분) ─────────────────────────────────────
  {
    id: '급행-이동',
    label: '급행 이동 중 — 전전역→전역 (빨강)',
    group: '급행',
    build: (base) => ({
      up: [
        train({
          trainId: 'M급행1',
          trainType: 'EXPRESS',
          currentStation: st('염창'),
          status: 'TRAVELING',
          stationsAway: 2,
          remainingSeconds: 190,
          segmentStartedAtMs: base - 25_000,
          floorSeconds: 85,
        }),
      ],
    }),
  },
  {
    id: '급행-정차',
    label: '급행 정차 — 전역(염창)에 서 있음',
    group: '급행',
    build: (base) => ({
      up: [
        train({
          trainId: 'M급행2',
          trainType: 'EXPRESS',
          currentStation: st('등촌'),
          status: 'ARRIVED',
          stationsAway: 1,
          remainingSeconds: 70,
          segmentStartedAtMs: base - 25_000,
          floorSeconds: 19,
        }),
      ],
    }),
  },
  {
    id: '급행-곧도착',
    label: '급행 내 역 진입 — "곧 도착"',
    group: '급행',
    build: (base) => ({
      up: [
        train({
          trainId: 'M급행3',
          trainType: 'EXPRESS',
          currentStation: st('증미'),
          status: 'APPROACHING',
          stationsAway: 0,
          remainingSeconds: 18,
          segmentStartedAtMs: base - 4_000,
          floorSeconds: 0,
        }),
      ],
    }),
  },
  {
    id: '급행-지연',
    label: '급행 지연 — 배지 + 빨강',
    group: '급행',
    build: (base) => ({
      down: [
        train({
          trainId: 'M급행4',
          trainType: 'EXPRESS',
          currentStation: st('가양'),
          status: 'TRAVELING',
          stationsAway: 1,
          remainingSeconds: 95,
          segmentStartedAtMs: base - 160_000,
          floorSeconds: 19,
        }),
      ],
    }),
  },

  // ── 겹침 (레인) ────────────────────────────────────────────
  {
    id: '겹침-구간',
    label: '같은 구간 일반+급행 — 아랫줄로 나뉨',
    group: '겹침',
    build: (base) => ({
      up: [
        train({
          trainId: 'M겹구간1',
          currentStation: st('등촌'),
          status: 'TRAVELING',
          stationsAway: 1,
          remainingSeconds: 95,
          segmentStartedAtMs: base - 25_000,
          floorSeconds: 19,
        }),
        train({
          trainId: 'M겹구간2',
          trainType: 'EXPRESS',
          currentStation: st('등촌'),
          status: 'TRAVELING',
          stationsAway: 1,
          remainingSeconds: 80,
          segmentStartedAtMs: base - 15_000,
          floorSeconds: 19,
        }),
      ],
    }),
  },
  {
    id: '겹침-역',
    label: '같은 역 정차+진입 — 아랫줄로 나뉨',
    group: '겹침',
    build: (base) => ({
      up: [
        train({
          trainId: 'M겹역1',
          currentStation: st('등촌'),
          status: 'ARRIVED',
          stationsAway: 1,
          remainingSeconds: 60,
          segmentStartedAtMs: base - 30_000,
          floorSeconds: 19,
        }),
        train({
          trainId: 'M겹역2',
          currentStation: st('등촌'),
          status: 'APPROACHING',
          stationsAway: 1,
          remainingSeconds: 95,
          segmentStartedAtMs: base - 5_000,
          floorSeconds: 19,
        }),
      ],
    }),
  },

  // ── 반대 방향 ──────────────────────────────────────────────
  {
    id: '하행-세트',
    label: '반대 방향 세트 — 이동+진입',
    group: '반대 방향',
    build: (base) => ({
      down: [
        train({
          trainId: 'M하행1',
          currentStation: st('양천향교'),
          status: 'TRAVELING',
          stationsAway: 2,
          remainingSeconds: 220,
          segmentStartedAtMs: base - 60_000,
          floorSeconds: 95,
        }),
        train({
          trainId: 'M하행2',
          currentStation: st('가양'),
          status: 'APPROACHING',
          stationsAway: 1,
          remainingSeconds: 95,
          segmentStartedAtMs: base - 10_000,
          floorSeconds: 19,
        }),
      ],
    }),
  },

  // ── 트랙 밖·심야 ───────────────────────────────────────────
  {
    id: '다음열차',
    label: '트랙 밖 열차 — "다음 열차 N분"',
    group: '트랙 밖·심야',
    build: (base) => ({
      up: [
        train({
          trainId: 'M다음1',
          currentStation: st('당산'),
          status: 'TRAVELING',
          stationsAway: 5,
          remainingSeconds: 540,
          segmentStartedAtMs: base - 10_000,
        }),
      ],
    }),
  },
  {
    id: '막차',
    label: '심야 막차 안내 — 23:47 (열차 없는 방향에서 보임)',
    group: '트랙 밖·심야',
    build: () => ({
      upSchedule: { departureAt: '2026-07-23T23:47:10+09:00', firstOfDay: false },
      downSchedule: { departureAt: '2026-07-23T23:52:30+09:00', firstOfDay: false },
    }),
  },
  {
    id: '운행종료',
    label: '운행 종료 — 첫차 안내 (열차 없는 방향에서 보임)',
    group: '트랙 밖·심야',
    build: () => ({
      upSchedule: { departureAt: '2026-07-24T05:40:50+09:00', firstOfDay: true },
      downSchedule: { departureAt: '2026-07-24T05:34:00+09:00', firstOfDay: true },
    }),
  },
  {
    id: '안내실패',
    label: '열차 없음 + 시간표 실패 — 기본 문구',
    group: '트랙 밖·심야',
    build: () => ({ upSchedule: null, downSchedule: null }),
  },
];

/** 선택한 시나리오들을 합쳐 양방향 블록으로. 나중 시나리오의 시간표 안내가 이긴다. */
export function combineScenarios(
  ids: string[],
  baseMs: number,
): { up: DirectionBlock; down: DirectionBlock } {
  const up: Train[] = [];
  const down: Train[] = [];
  let upSchedule: DirectionBlock['nextSchedule'];
  let downSchedule: DirectionBlock['nextSchedule'];

  for (const id of ids) {
    const scenario = SCENARIOS.find((s) => s.id === id);
    if (!scenario) continue;
    const effect = scenario.build(baseMs);
    if (effect.up) up.push(...effect.up);
    if (effect.down) down.push(...effect.down);
    if (effect.upSchedule !== undefined) upSchedule = effect.upSchedule;
    if (effect.downSchedule !== undefined) downSchedule = effect.downSchedule;
  }

  return {
    up: { directionId: 'UP', directionName: '개화 방면', trains: up, nextSchedule: upSchedule },
    down: {
      directionId: 'DOWN',
      directionName: '중앙보훈병원 방면',
      trains: down,
      nextSchedule: downSchedule,
    },
  };
}
