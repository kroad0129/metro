import type { Train } from '../types/subway';
import { formatRemaining } from '../utils/trackPosition';

type Props = {
  train: Train;
  /** 구간 시작(떠난 역)의 트랙 좌표(%). */
  leftPercent: number;
  /** 구간 폭(%) — 진행 방향(오른쪽)으로 이만큼이 이 열차의 구간이다. */
  widthPercent: number;
  /** 가상 열차 모델의 남은 시간(초) — 위치는 몰라도 시간은 매초 흐른다. */
  remainingSeconds: number | null;
  /** 운영사 추정 소요를 넘겨 같은 구간에 머무는 중 — 오래 흐르는 화살표가 버그가 아님을 알린다. */
  delayed: boolean;
  showExpressBadge: boolean;
  selectedStationName: string;
};

/**
 * 이동 중인 열차 — 두 역 사이 구간에 흐르는 화살표.
 * 구간 내 몇 % 지점인지는 API가 모르는 정보라 점의 위치로 주장하지 않고,
 * "이 구간을 달리는 중"이라는 사실만 방향 화살표의 흐름으로 전달한다.
 */
export function TrainFlow({
  train,
  leftPercent,
  widthPercent,
  remainingSeconds,
  delayed,
  showExpressBadge,
  selectedStationName,
}: Props) {
  const typeClass = train.trainType === 'EXPRESS' ? 'train-flow--express' : 'train-flow--local';
  const timeText = formatRemaining(remainingSeconds);
  const timeAria = timeText === '곧 도착' || timeText === '—' ? timeText : `${timeText} 후`;
  const base = `${selectedStationName} 방향, 이동 중, ${timeAria}`;
  const ariaLabel = delayed ? `${base}, 지연 중` : base;

  return (
    <div
      className={`train-flow ${typeClass}`}
      data-testid="train-flow"
      style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
      aria-label={ariaLabel}
    >
      <span className="train-flow__chevrons" aria-hidden="true">
        <span className="train-flow__chev">›</span>
        <span className="train-flow__chev">›</span>
        <span className="train-flow__chev">›</span>
        <span className="train-flow__chev">›</span>
      </span>
      <span className="train-flow__meta">
        <span className="train-flow__time">{timeText}</span>
        {delayed && <span className="train-flow__delay">지연</span>}
        {showExpressBadge && <span className="train-flow__badge">급행</span>}
      </span>
    </div>
  );
}
