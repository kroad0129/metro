import type { DirectionBlock, Station } from '../types/subway';
import { assignLanes, segmentPercents, trainPlacement } from '../utils/placement';
import { buildTrack, formatRemaining } from '../utils/trackPosition';
import {
  DELAY_NOTICE_SECONDS,
  leftPercentFromGaps,
  liveRemainingSeconds,
  stallSeconds,
} from '../utils/virtualTrain';
import { LineTrack, type OnTrackTrain } from './LineTrack';
import './DirectionPanel.css';

type Props = {
  stations: Station[];
  selected: Station;
  block: DirectionBlock;
  /** 화면 전용 초 단위 틱(useNow) — 가상 열차를 매초 전진시킨다. 조회를 유발하지 않는다. */
  nowMs: number;
};

export function DirectionPanel({ stations, selected, block, nowMs }: Props) {
  const track = buildTrack(stations, selected, block.directionId);
  const maxGaps = track.length - 1;

  const positioned = block.trains.map((train) => {
    // 이산 배치: 역에 있으면 점, 구간에 있으면 화살표 흐름. 위치는 보간하지 않는다.
    const placement = trainPlacement(train);
    let pos: OnTrackTrain['pos'] | null = null;
    if (placement?.kind === 'station') {
      const left = leftPercentFromGaps(maxGaps, placement.gap);
      if (left !== null) pos = { kind: 'station', left };
    } else if (placement?.kind === 'segment') {
      const seg = segmentPercents(maxGaps, placement.fromGap, placement.toGap);
      if (seg) pos = { kind: 'segment', ...seg };
    }
    return {
      train,
      pos,
      passed: placement === null && train.stationsAway === 0,
      remaining: liveRemainingSeconds(train, nowMs),
      delayed: stallSeconds(train, nowMs) > DELAY_NOTICE_SECONDS,
    };
  });

  const placed = positioned.filter((p): p is typeof p & { pos: OnTrackTrain['pos'] } => p.pos !== null);
  // 시각적 자리(점: 역 주변, 화살표: 구간 가운데 묶음)가 겹치는 열차는 아랫줄로 내린다.
  const lanes = assignLanes(
    placed.map(({ pos }) =>
      pos.kind === 'station'
        ? { start: pos.left - 8, end: pos.left + 8 }
        : { start: pos.left + pos.width / 2 - 10, end: pos.left + pos.width / 2 + 10 },
    ),
  );
  const onTrack: OnTrackTrain[] = placed.map((p, i) => ({ ...p, lane: lanes[i] }));
  // 트랙보다 먼 열차(지나간 열차는 제외) 중 가장 가까운 것 — "다음 열차"로 안내한다.
  const nextOffTrack = positioned.find((p) => p.pos === null && !p.passed);

  return (
    <section className="direction-panel">
      <h2 className="direction-panel__title">{block.directionName}</h2>

      <LineTrack track={track} trains={onTrack} selected={selected} />

      {block.trains.length === 0 && <EmptyNotice schedule={block.nextSchedule} />}

      {nextOffTrack && (
        <p className="direction-panel__next">다음 열차 {formatRemaining(nextOffTrack.remaining)}</p>
      )}
    </section>
  );
}

/** "2026-07-24T05:40:50+09:00" → "05:40". 백엔드가 형식을 보장하므로 문자열로 자른다. */
function hhmmOf(departureAt: string): string {
  return departureAt.slice(11, 16);
}

/**
 * 접근 중인 열차가 없을 때 — 실시간 API의 시야(약 20분) 밖이라는 뜻이다.
 * 시간표 기준 다음 출발이 있으면 그걸 알려주고(심야·막차의 실제 구멍을 메운다),
 * 오늘 운행이 끝났으면 첫차로 안내한다. 시간표 조회가 실패했으면 기존 문구 그대로.
 */
function EmptyNotice({ schedule }: { schedule: DirectionBlock['nextSchedule'] }) {
  if (!schedule) return <p className="direction-panel__empty">접근 중인 열차 없음</p>;

  return (
    <p className="direction-panel__empty">
      {schedule.firstOfDay
        ? `운행 종료 — 첫차 ${hhmmOf(schedule.departureAt)} (시간표 기준)`
        : `다음 열차 ${hhmmOf(schedule.departureAt)} 출발 (시간표 기준)`}
    </p>
  );
}
