import { describe, expect, it } from 'vitest';
import type { DirectionId, Train, TrainsResponse, TrainStatus } from '../types/subway';
import { DELAY_NOTICE_SECONDS, liveRemainingSeconds, stallSeconds } from './virtualTrain';
import { trainPlacement, type Placement } from './placement';
import { trackSegments, type AnchorMap } from './segmentTracker';
import type { PaceTable } from './paceTable';
import polls from './__fixtures__/replay-jeungmi.json';

/**
 * 재생(replay) 검증 — 실제 서울시 API를 10초 간격으로 6분간 녹화한 원본 응답을
 * 실제 모듈(trackSegments → trainPlacement/liveRemainingSeconds)에 그대로 통과시키고,
 * 1초 단위로 화면이 보게 될 값을 샘플링해 약속이 지켜지는지 기계적으로 확인한다.
 *
 * 지키는 약속 (이산 배치 모델):
 * 1) 남은 시간은 절대 늘어나지 않는다 (폴링이 와도).
 * 2) 배치는 절대 뒤로 가지 않는다 (구간을 달리다 지나온 역으로 돌아가지 않는다).
 * 3) 폴링 순간의 남은 시간 하향 점프는 작다 (모델과 실제의 어긋남 한도).
 * 4) 역에 서 있는 열차(정차·진입)는 지연으로 표시되지 않는다 — 정차는 정상이다.
 * 5) 실제 지연(운영사 추정 초과)은 감지된다 — 오래 흐르는 화살표가 정보가 된다.
 */

type RawTrain = {
  btrainNo: string;
  statnFid: string;
  statnTid: string;
  barvlDt: string;
  arvlCd: string;
  arvlMsg3: string;
  btrainSttus: string;
  ordkey: string;
  recptnDt: string;
};
type Poll = { t: number; trains: RawTrain[] };

const STATUS: Record<string, TrainStatus> = {
  '0': 'APPROACHING',
  '1': 'ARRIVED',
  '2': 'DEPARTED',
  '3': 'DEPARTED',
  '4': 'APPROACHING',
  '5': 'ARRIVED',
  '99': 'TRAVELING',
};

/** 백엔드 매퍼와 같은 규칙의 미니 변환 — 재생에 필요한 필드만. */
function toTrain(raw: RawTrain): { train: Train; direction: DirectionId } | null {
  const fid = Number(raw.statnFid);
  const tid = Number(raw.statnTid);
  if (!Number.isFinite(fid) || !Number.isFinite(tid) || fid === tid) return null;
  const direction: DirectionId = tid < fid ? 'UP' : 'DOWN';

  const seconds = Number(raw.barvlDt);
  const distance = raw.ordkey?.slice(2, 5);
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw.recptnDt ?? '');

  return {
    direction,
    train: {
      trainId: raw.btrainNo,
      trainType: raw.btrainSttus.includes('급행') || raw.btrainSttus.includes('특급') ? 'EXPRESS' : 'LOCAL',
      currentStation: { stationId: raw.arvlMsg3, name: raw.arvlMsg3, order: 0, isExpressStop: false },
      remainingSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
      status: STATUS[raw.arvlCd] ?? 'TRAVELING',
      positionRatio: 0.5,
      stationsAway: /^\d{3}$/.test(distance ?? '') ? Number(distance) : null,
      recptnAt: m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00` : null,
    },
  };
}

function toResponse(poll: Poll): TrainsResponse {
  const up: Train[] = [];
  const down: Train[] = [];
  for (const raw of poll.trains) {
    const mapped = toTrain(raw);
    if (!mapped) continue;
    (mapped.direction === 'UP' ? up : down).push(mapped.train);
  }
  return {
    line: { id: '9', name: '서울 지하철 9호선' },
    station: { stationId: '1009000908', name: '증미', order: 8, isExpressStop: false },
    directions: [
      { directionId: 'UP', directionName: '개화 방면', trains: up },
      { directionId: 'DOWN', directionName: '중앙보훈병원 방면', trains: down },
    ],
    updatedAt: new Date(poll.t * 1000).toISOString(),
    stale: false,
  };
}

/** 배치를 "선택역까지 얼마나 남았나" 축의 숫자로 — 작아질수록 전진. 역=d, 구간=d−0.5. */
function placementOrder(placement: Placement): number | null {
  if (placement === null) return null;
  return placement.kind === 'station' ? placement.gap : placement.fromGap - 0.5;
}

type Sample = { atMs: number; live: number; order: number; parked: boolean; stall: number; seam: boolean };
type Boundary = { beforeLive: number; afterLive: number; firstTransition: boolean };

describe('실녹화 재생 검증 (증미, 6분·폴링 36회)', () => {
  // 전체 재생을 한 번 수행해 열차별 1초 샘플을 모은다.
  const byTrain = new Map<string, Sample[]>();
  const pollBoundaries = new Map<string, Boundary[]>();
  const seenTransition = new Set<string>();
  const lastStationsAway = new Map<string, number | null>();

  let anchors: AnchorMap = new Map();
  const pace: PaceTable = new Map();
  const typedPolls = polls as Poll[];

  let annotated: TrainsResponse | null = null;
  for (let i = 0; i < typedPolls.length; i += 1) {
    const nowMs = typedPolls[i].t * 1000;

    // 폴링 직전 마지막 값(경계 점프 측정용)
    const lastBefore = new Map<string, number>();
    if (annotated) {
      for (const dir of annotated.directions) {
        for (const train of dir.trains) {
          const live = liveRemainingSeconds(train, nowMs);
          if (live !== null) lastBefore.set(train.trainId, live);
        }
      }
    }

    const tracked = trackSegments(toResponse(typedPolls[i]), anchors, pace, nowMs);
    anchors = tracked.anchors;
    annotated = tracked.response;

    // 경계 점프 기록 (+ 열차별 첫 구간 전이 여부)
    for (const dir of annotated.directions) {
      for (const train of dir.trains) {
        const beforeLive = lastBefore.get(train.trainId);
        const live = liveRemainingSeconds(train, nowMs);

        const prevD = lastStationsAway.get(train.trainId);
        const transitioned = prevD !== undefined && prevD !== train.stationsAway;
        const firstTransition = transitioned && !seenTransition.has(train.trainId);
        if (transitioned) seenTransition.add(train.trainId);
        lastStationsAway.set(train.trainId, train.stationsAway);

        if (beforeLive !== undefined && live !== null) {
          const list = pollBoundaries.get(train.trainId) ?? [];
          list.push({ beforeLive, afterLive: live, firstTransition });
          pollBoundaries.set(train.trainId, list);
        }
      }
    }

    // 다음 폴링까지 1초 간격 샘플링 (마지막 폴링은 10초만)
    const endMs = i + 1 < typedPolls.length ? typedPolls[i + 1].t * 1000 : nowMs + 10_000;
    for (let atMs = nowMs; atMs < endMs; atMs += 1000) {
      for (const dir of annotated.directions) {
        for (const train of dir.trains) {
          const placement = trainPlacement(train);
          const order = placementOrder(placement);
          const live = liveRemainingSeconds(train, atMs);
          if (order === null || live === null) continue;
          const list = byTrain.get(train.trainId) ?? [];
          list.push({
            atMs,
            live,
            order,
            parked: placement!.kind === 'station',
            stall: stallSeconds(train, atMs),
            seam: atMs === nowMs, // 폴링 직후 첫 샘플 — 구간 전이 이음새일 수 있다
          });
          byTrain.set(train.trainId, list);
        }
      }
    }
  }

  it('재생에 충분한 데이터가 있다', () => {
    expect(typedPolls.length).toBeGreaterThanOrEqual(30);
    expect(byTrain.size).toBeGreaterThanOrEqual(4);
  });

  it('남은 시간은 절대 늘어나지 않는다', () => {
    for (const [trainId, samples] of byTrain) {
      for (let i = 1; i < samples.length; i += 1) {
        const rise = samples[i].live - samples[i - 1].live;
        expect(
          rise,
          `${trainId} @${samples[i].atMs}: ${samples[i - 1].live}→${samples[i].live}`,
        ).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('배치는 절대 뒤로 가지 않는다 — 달리던 구간에서 지나온 역으로 돌아가지 않는다', () => {
    for (const [trainId, samples] of byTrain) {
      for (let i = 1; i < samples.length; i += 1) {
        const backward = samples[i].order - samples[i - 1].order;
        expect(
          backward,
          `${trainId} @${samples[i].atMs}: 배치 ${samples[i - 1].order}→${samples[i].order}`,
        ).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it('폴링 순간의 남은 시간 하향 점프가 작다 — 첫 전이(위치 미상 보정)만 크게 허용', () => {
    // 처음 본 열차는 구간 어디쯤인지 몰라 "절반" 가정을 쓴다. 실제 위치가 구간 끝자락이었다면
    // 첫 전이에서 최대 반 구간(~65초)의 보정이 온다 — 앱 시작 직후 열차당 1회뿐이다.
    // 그 뒤로는 폴링 간격 + 서울시 데이터 지연(~10+27초) 안쪽이어야 한다.
    for (const [trainId, jumps] of pollBoundaries) {
      for (const j of jumps) {
        const drop = j.beforeLive - j.afterLive;
        // 첫 전이는 "구간 절반" 가정의 보정 + 시발역 출발 대기(개화→김포공항 실측 310초) 같은
        // 구간 특이 소요까지 겹칠 수 있다. 페이스 테이블이 학습(localStorage 유지)하면 소멸한다.
        const limit = j.firstTransition ? 150 : 40;
        expect(drop, `${trainId}: ${j.beforeLive}→${j.afterLive} (첫전이:${j.firstTransition})`).toBeLessThanOrEqual(limit);
      }
    }
  });

  it('역에 서 있는 열차(정차·진입)는 지연으로 표시되지 않는다 — 정차는 정상이다', () => {
    for (const [trainId, samples] of byTrain) {
      for (const s of samples) {
        if (s.parked) {
          expect(s.stall, `${trainId} @${s.atMs}: 정차 중인데 지연 감지`).toBe(0);
        }
      }
    }
  });

  it('실제 지연은 감지된다 — 9129의 당산→선유도 지연(추정 125초, 실측 191초)', () => {
    // 어떤 모델도 실제 지연을 없앨 수는 없다. 대신 오래 흐르는 화살표에 "지연"이 붙어
    // 멈춘 것처럼 보이는 시간이 정보가 되는지를 확인한다.
    const samples = byTrain.get('9129') ?? [];
    const worstStall = Math.max(...samples.map((s) => s.stall), 0);
    expect(worstStall).toBeGreaterThan(DELAY_NOTICE_SECONDS);
  });
});
