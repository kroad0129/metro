import type { Train } from '../types/subway';
import { formatRemaining, trainCallout } from '../utils/trackPosition';

type Props = {
  train: Train;
  /** 트랙 위 가상 위치(%). 매초 갱신되며 CSS transition이 초 사이를 부드럽게 잇는다. */
  leftPercent: number;
  /** 가상 열차 모델의 남은 시간(초). 점 위치와 같은 모델에서 나와 서로 모순되지 않는다. */
  remainingSeconds: number | null;
  /** 운영사 추정 소요를 넘겨 같은 구간에 머무는 중 — 멈춘 점이 버그가 아님을 알린다. */
  delayed: boolean;
  showExpressBadge: boolean;
  /** 트랙 오른쪽 끝에 고정된 선택역 이름 — 내 역 도착 판단과 aria-label에 쓴다. */
  selectedStationName: string;
};

export function TrainMarker({
  train,
  leftPercent,
  remainingSeconds,
  delayed,
  showExpressBadge,
  selectedStationName,
}: Props) {
  const isSelectedStation = train.currentStation.name === selectedStationName;
  const callout = trainCallout(train, isSelectedStation);

  // 내 역에서의 안내(도착/곧 도착)는 시간을 가리고 시간 자리에 크게. 중간 역 정차는 그 역 위에.
  const timeText = isSelectedStation && callout ? callout : formatRemaining(remainingSeconds);
  const stopLabel = !isSelectedStation && callout ? callout : null;

  const typeClass = train.trainType === 'EXPRESS' ? 'train-marker--express' : 'train-marker--local';
  // 진입 중(곧 도착)은 점을 맥동시켜 "확정 정차"와 눈으로 구분되게 한다.
  const arrivingClass = train.status === 'APPROACHING' ? ' train-marker--arriving' : '';
  const timeAria =
    timeText === '곧 도착' || timeText === '도착' || timeText === '—' ? timeText : `${timeText} 후`;
  const base = stopLabel
    ? `${selectedStationName} 방향, ${stopLabel}, ${timeAria}`
    : `${selectedStationName} 방향, ${timeAria}`;
  const ariaLabel = delayed ? `${base}, 지연 중` : base;

  return (
    <div
      className={`train-marker ${typeClass}${arrivingClass}`}
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
      {delayed && <span className="train-marker__delay">지연</span>}
      {showExpressBadge && <span className="train-marker__badge">급행</span>}
    </div>
  );
}
