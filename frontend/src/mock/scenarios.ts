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
  // ── ① 한 대의 흐름 (전역→내 역) ────────────────────────────
  // 위에서 아래로 하나씩 켜보면 열차가 증미로 들어오는 과정이 순서대로 보인다:
  // 진입(등촌) → 정차(등촌) → 출발 → 이동 → 곧 도착 → 도착.
  {
    id: '진입-전역',
    label: '① 전역 진입 — 등촌에 들어섬 ("진입")',
    group: '① 한 대의 흐름',
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
    id: '정차-전역',
    label: '② 전역 정차 — 등촌에 서 있음 ("정차")',
    group: '① 한 대의 흐름',
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
    id: '막출발',
    label: '③ 막 출발 — 등촌 떠남, 구간 첫 ⅓ ("출발")',
    group: '① 한 대의 흐름',
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
    label: '④ 이동 중 — 등촌→증미 가운데 ⅓ ("이동")',
    group: '① 한 대의 흐름',
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
    id: '곧도착',
    label: '⑤ 내 역 곧 도착 — 마지막 ⅓ + 문구',
    group: '① 한 대의 흐름',
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
    label: '⑥ 내 역 도착 — 증미에 섬',
    group: '① 한 대의 흐름',
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

  // ── ② 멀리서 접근 (전전역·트랙 밖) ─────────────────────────
  {
    id: '이동-전전역',
    label: '이동 중 — 전전역(염창)→전역',
    group: '② 멀리서 접근',
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
    id: '다음열차',
    label: '트랙 밖 열차 — "다음 열차 N분"',
    group: '② 멀리서 접근',
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

  // ── ③ 급행 (통과 vs 정차) ──────────────────────────────────
  {
    id: '급행-이동',
    label: '급행 이동 중 — 전전역→전역 (빨강)',
    group: '③ 급행',
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
    id: '급행-통과',
    label: '급행 통과 — 등촌(비급행역) 지남 ("통과")',
    group: '③ 급행',
    build: (base) => ({
      up: [
        train({
          trainId: 'M급행통과',
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
    id: '급행-정차역',
    label: '급행 정차 — 염창(급행역)에 섬 ("정차")',
    group: '③ 급행',
    build: (base) => ({
      up: [
        train({
          trainId: 'M급행정차',
          trainType: 'EXPRESS',
          currentStation: st('염창'),
          status: 'ARRIVED',
          stationsAway: 2,
          remainingSeconds: 185,
          segmentStartedAtMs: base - 25_000,
          floorSeconds: 85,
        }),
      ],
    }),
  },
  {
    id: '급행-곧도착',
    label: '급행 내 역 진입 — "곧 도착"',
    group: '③ 급행',
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
    id: '급행-추월',
    label: '급행 추월 — 일반은 등촌 정차, 급행이 앞서 달림 (급행이 "다음")',
    group: '③ 급행',
    build: (base) => ({
      up: [
        train({
          trainId: 'M추월L',
          currentStation: st('등촌'),
          status: 'ARRIVED',
          stationsAway: 1,
          remainingSeconds: 95,
          segmentStartedAtMs: base - 60_000,
          floorSeconds: 19,
        }),
        train({
          trainId: 'M추월E',
          trainType: 'EXPRESS',
          currentStation: st('등촌'),
          status: 'DEPARTED',
          stationsAway: 1,
          remainingSeconds: 95,
          segmentStartedAtMs: base - 10_000,
          moveStartMs: base - 10_000,
          moveStartRemainingSeconds: 60,
          floorSeconds: 19,
        }),
      ],
    }),
  },

  // ── ④ 겹침 (한 마크 두 색) ─────────────────────────────────
  {
    id: '겹침-구간',
    label: '같은 구간 일반+급행 — 한 마크 두 색',
    group: '④ 겹침',
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
    label: '같은 역 정차+진입 — 각자 그대로 (안 묶임)',
    group: '④ 겹침',
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

  {
    id: '겹침-통과',
    label: '일반 정차 + 급행 통과 겹침 — 딱지는 "통과"',
    group: '④ 겹침',
    build: (base) => ({
      up: [
        train({
          trainId: 'M겹통과L',
          currentStation: st('등촌'),
          status: 'ARRIVED',
          stationsAway: 1,
          remainingSeconds: 60,
          segmentStartedAtMs: base - 30_000,
          floorSeconds: 19,
        }),
        train({
          trainId: 'M겹통과E',
          trainType: 'EXPRESS',
          currentStation: st('등촌'),
          status: 'ARRIVED',
          stationsAway: 1,
          remainingSeconds: 45,
          segmentStartedAtMs: base - 20_000,
          floorSeconds: 19,
        }),
      ],
    }),
  },

  // ── ⑤ 반대 방향 ────────────────────────────────────────────
  {
    id: '하행-세트',
    label: '반대 방향 세트 — 이동+진입 (좌우 반전)',
    group: '⑤ 반대 방향',
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

  // ── ⑥ 심야·안내 (열차 없는 방향에서 보임) ──────────────────
  {
    id: '막차',
    label: '심야 막차 안내 — 23:47',
    group: '⑥ 심야·안내',
    build: () => ({
      upSchedule: { departureAt: '2026-07-23T23:47:10+09:00', firstOfDay: false },
      downSchedule: { departureAt: '2026-07-23T23:52:30+09:00', firstOfDay: false },
    }),
  },
  {
    id: '운행종료',
    label: '운행 종료 — 첫차 안내',
    group: '⑥ 심야·안내',
    build: () => ({
      upSchedule: { departureAt: '2026-07-24T05:40:50+09:00', firstOfDay: true },
      downSchedule: { departureAt: '2026-07-24T05:34:00+09:00', firstOfDay: true },
    }),
  },
  {
    id: '안내실패',
    label: '열차 없음 + 시간표 실패 — 기본 문구',
    group: '⑥ 심야·안내',
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
