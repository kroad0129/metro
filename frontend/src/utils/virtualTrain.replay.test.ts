import { describe, expect, it } from 'vitest';
import type { DirectionId, Train, TrainsResponse, TrainStatus } from '../types/subway';
import { liveRemainingSeconds, stallSeconds, virtualGaps } from './virtualTrain';
import { trackSegments, type AnchorMap } from './segmentTracker';
import type { PaceTable } from './paceTable';
import polls from './__fixtures__/replay-jeungmi.json';

/**
 * 재생(replay) 검증 — 실제 서울시 API를 10초 간격으로 6분간 녹화한 원본 응답을
 * 실제 모듈(trackSegments → virtualGaps/liveRemainingSeconds)에 그대로 통과시키고,
 * 1초 단위로 화면이 보게 될 값을 샘플링해 "멈춤·튐"이 없는지 기계적으로 확인한다.
 *
 * 지키는 약속:
 * 1) 남은 시간은 절대 늘어나지 않는다 (폴링이 와도).
 * 2) 점은 절대 뒤로 가지 않는다.
 * 3) 폴링 순간의 하향 점프는 작다 (모델과 실제의 어긋남 한도).
 * 4) 달리는 열차가 멈춰 보이는 구간(둘 다 정지)은 짧다.
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

type Sample = { atMs: number; live: number; gaps: number; status: TrainStatus; stall: number; seam: boolean };
type Boundary = {
  beforeLive: number;
  afterLive: number;
  beforeGaps: number;
  afterGaps: number;
  firstTransition: boolean;
};

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

    // 폴링 직전 마지막 샘플(경계 점프 측정용)
    const lastBefore = new Map<string, Sample>();
    if (annotated) {
      for (const dir of annotated.directions) {
        for (const train of dir.trains) {
          const gaps = virtualGaps(train, nowMs);
          const live = liveRemainingSeconds(train, nowMs);
          if (gaps !== null && live !== null) {
            lastBefore.set(train.trainId, {
              atMs: nowMs,
              live,
              gaps,
              status: train.status,
              stall: stallSeconds(train, nowMs),
              seam: true,
            });
          }
        }
      }
    }

    const tracked = trackSegments(toResponse(typedPolls[i]), anchors, pace, nowMs);
    anchors = tracked.anchors;
    annotated = tracked.response;

    // 경계 점프 기록 (+ 열차별 첫 구간 전이 여부)
    for (const dir of annotated.directions) {
      for (const train of dir.trains) {
        const before = lastBefore.get(train.trainId);
        const gaps = virtualGaps(train, nowMs);
        const live = liveRemainingSeconds(train, nowMs);

        const prevD = lastStationsAway.get(train.trainId);
        const transitioned = prevD !== undefined && prevD !== train.stationsAway;
        const firstTransition = transitioned && !seenTransition.has(train.trainId);
        if (transitioned) seenTransition.add(train.trainId);
        lastStationsAway.set(train.trainId, train.stationsAway);

        if (before && gaps !== null && live !== null) {
          const list = pollBoundaries.get(train.trainId) ?? [];
          list.push({
            beforeLive: before.live,
            afterLive: live,
            beforeGaps: before.gaps,
            afterGaps: gaps,
            firstTransition,
          });
          pollBoundaries.set(train.trainId, list);
        }
      }
    }

    // 다음 폴링까지 1초 간격 샘플링 (마지막 폴링은 10초만)
    const endMs = i + 1 < typedPolls.length ? typedPolls[i + 1].t * 1000 : nowMs + 10_000;
    for (let atMs = nowMs; atMs < endMs; atMs += 1000) {
      for (const dir of annotated.directions) {
        for (const train of dir.trains) {
          const gaps = virtualGaps(train, atMs);
          const live = liveRemainingSeconds(train, atMs);
          if (gaps === null || live === null) continue;
          const list = byTrain.get(train.trainId) ?? [];
          list.push({
            atMs,
            live,
            gaps,
            status: train.status,
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

  it('점은 절대 뒤로 가지 않는다', () => {
    for (const [trainId, samples] of byTrain) {
      for (let i = 1; i < samples.length; i += 1) {
        const backward = samples[i].gaps - samples[i - 1].gaps;
        expect(backward, `${trainId} @${samples[i].atMs}: gaps ${samples[i - 1].gaps}→${samples[i].gaps}`).toBeLessThanOrEqual(1e-6);
      }
    }
  });

  it('폴링 순간의 하향 점프가 작다 — 첫 전이(위치 미상 보정)만 크게 허용', () => {
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

  it('오래 멈춘 달리는 열차는 반드시 "지연"으로 감지된다 — 멈춤이 정보가 된다', () => {
    // 실제 지연(예: 당산→선유도 추정 125초, 실측 191초)은 어떤 모델도 없앨 수 없다 —
    // 점을 세우는 게 정직하다. 대신 그 멈춤을 stallSeconds가 감지해 UI가 "지연"을 달 수
    // 있어야 하고, 물리적으로 말이 안 되는 길이(4분+)는 모델 결함으로 본다.
    for (const [trainId, samples] of byTrain) {
      let stall = 0;
      let worst = 0;
      for (let i = 1; i < samples.length; i += 1) {
        const moving = samples[i].status === 'TRAVELING' || samples[i].status === 'DEPARTED';
        const frozen = Math.abs(samples[i].gaps - samples[i - 1].gaps) < 1e-9;
        if (moving && frozen) {
          stall += (samples[i].atMs - samples[i - 1].atMs) / 1000;
          worst = Math.max(worst, stall);
          if (stall > 25 && !samples[i].seam) {
            expect(samples[i].stall, `${trainId} @${samples[i].atMs}: ${stall}초째 멈췄는데 지연 미감지`).toBeGreaterThan(0);
          }
        } else {
          stall = 0;
        }
      }
      expect(worst, `${trainId} 최장 멈춤 ${worst}초`).toBeLessThanOrEqual(240);
    }
  });
});
