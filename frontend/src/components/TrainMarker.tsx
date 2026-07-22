import type { Train } from '../types/subway';
import { formatRemaining, remainingAt } from '../utils/trackPosition';

type Props = {
  train: Train;
  leftPercent: number;
  showExpressBadge: boolean;
  /** 화면 전용 틱 — useNow()가 매초 갱신한다. 이 값 자체는 조회를 유발하지 않는다. */
  nowMs: number;
  /** 이 열차 데이터가 조회된 시각. remainingAt이 nowMs와의 차이만큼 남은 시간을 줄인다. */
  updatedAt: string;
  /** 트랙 오른쪽 끝에 고정된 선택역 이름 — 열차의 진행 방향을 aria-label로 알려준다. */
  selectedStationName: string;
};

export function TrainMarker({
  train,
  leftPercent,
  showExpressBadge,
  nowMs,
  updatedAt,
  selectedStationName,
}: Props) {
  const remaining = remainingAt(train.remainingSeconds, updatedAt, nowMs);
  const label = formatRemaining(remaining);
  const ariaLabel =
    label === '—' || label === '곧 도착'
      ? `${selectedStationName} 방향, ${label}`
      : `${selectedStationName} 방향, ${label} 후`;

  return (
    <div
      className="train-marker"
      data-testid="train-marker"
      style={{ left: `${leftPercent}%` }}
      aria-label={ariaLabel}
    >
      <span className="train-marker__dot-wrap">
        <span className="train-marker__dot" aria-hidden="true" />
        <span className="train-marker__arrow" aria-hidden="true">
          ▸
        </span>
      </span>
      <span className="train-marker__time">{label}</span>
      {showExpressBadge && <span className="train-marker__badge">급행</span>}
    </div>
  );
}
