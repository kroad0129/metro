import type { Train } from '../types/subway';
import { formatRemaining, trainCallout } from '../utils/trackPosition';

type Props = {
  train: Train;
  /** 트랙 위 가상 위치(%). 매초 갱신되며 CSS transition이 초 사이를 부드럽게 잇는다. */
  leftPercent: number;
  /** 가상 열차 모델의 남은 시간(초). 점 위치와 같은 모델에서 나와 서로 모순되지 않는다. */
  remainingSeconds: number | null;
  showExpressBadge: boolean;
  /** 트랙 오른쪽 끝에 고정된 선택역 이름 — 내 역 도착 판단과 aria-label에 쓴다. */
  selectedStationName: string;
};

export function TrainMarker({
  train,
  leftPercent,
  remainingSeconds,
  showExpressBadge,
  selectedStationName,
}: Props) {
  const isSelectedStation = train.currentStation.name === selectedStationName;
  const callout = trainCallout(train, isSelectedStation);

  // 내 역에서의 안내(도착/곧 도착)는 시간을 가리고 시간 자리에 크게. 중간 역 정차는 그 역 위에.
  const timeText = isSelectedStation && callout ? callout : formatRemaining(remainingSeconds);
  const stopLabel = !isSelectedStation && callout ? callout : null;

  const typeClass = train.trainType === 'EXPRESS' ? 'train-marker--express' : 'train-marker--local';
  const timeAria =
    timeText === '곧 도착' || timeText === '도착' || timeText === '—' ? timeText : `${timeText} 후`;
  const ariaLabel = stopLabel
    ? `${selectedStationName} 방향, ${stopLabel}, ${timeAria}`
    : `${selectedStationName} 방향, ${timeAria}`;

  return (
    <div
      className={`train-marker ${typeClass}`}
      data-testid="train-marker"
      style={{ left: `${leftPercent}%` }}
      aria-label={ariaLabel}
    >
      <span className="train-marker__dot-wrap">
        {stopLabel && (
          <span className="train-marker__callout" aria-hidden="true">
            {stopLabel}
          </span>
        )}
        <span className="train-marker__dot" aria-hidden="true" />
        <span className="train-marker__arrow" aria-hidden="true">
          ▶
        </span>
      </span>
      <span className="train-marker__time">{timeText}</span>
      {showExpressBadge && <span className="train-marker__badge">급행</span>}
    </div>
  );
}
