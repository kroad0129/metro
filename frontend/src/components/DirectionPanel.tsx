import type { DirectionBlock, Station } from '../types/subway';
import { layoutDirection } from '../utils/panelLayout';
import { arrivalSlots, groupMarks } from '../utils/trackMarks';
import { ArrivalRow } from './ArrivalRow';
import { TrackLine } from './TrackLine';
import './DirectionPanel.css';

type Props = {
  stations: Station[];
  selected: Station;
  block: DirectionBlock;
  /** 화면 전용 초 단위 틱(useNow) — 남은 시간을 매초 줄인다. 조회를 유발하지 않는다. */
  nowMs: number;
  /**
   * true면 선택역이 왼쪽 끝, 열차는 오른쪽에서 왼쪽으로 흐른다.
   * 두 방향 패널이 서로 반대를 보게 해 실제 승강장처럼 읽히게 한다.
   */
  flip?: boolean;
};

export function DirectionPanel({ stations, selected, block, nowMs, flip = false }: Props) {
  const { track, placed, nextOffTrack } = layoutDirection(stations, selected, block, nowMs);
  const groups = groupMarks(placed);
  const slots = arrivalSlots(placed, nextOffTrack, selected.name);

  return (
    <section className="direction-panel">
      <h2 className="direction-panel__title">
        {flip ? (
          <>
            <span className="direction-panel__dir" aria-hidden="true">
              ←
            </span>
            {block.directionName}
          </>
        ) : (
          <>
            {block.directionName}
            <span className="direction-panel__dir" aria-hidden="true">
              →
            </span>
          </>
        )}
      </h2>

      <ArrivalRow slots={slots} />

      <TrackLine track={track} selected={selected} groups={groups} flip={flip} />

      {block.trains.length === 0 && <EmptyNotice schedule={block.nextSchedule} />}
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
