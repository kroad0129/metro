import type { Train } from '../types/subway';
import { formatRemaining } from '../utils/trackPosition';

type Props = {
  train: Train;
  /** 이 열차가 차지하는 위상(구간의 ⅓)의 시작 트랙 좌표(%). */
  leftPercent: number;
  /** 위상 폭(%) — 구간을 3분할한 한 칸. 출발=앞, 운행=가운데, 진입=끝 칸이다. */
  widthPercent: number;
  /** 가상 열차 모델의 남은 시간(초) — 위치는 몰라도 시간은 매초 흐른다. */
  remainingSeconds: number | null;
  /** 운영사 추정 소요를 넘겨 같은 구간에 머무는 중 — 오래 흐르는 화살표가 버그가 아님을 알린다. */
  delayed: boolean;
  /** 시각적 자리가 겹칠 때의 줄 번호 — 0이면 트랙 줄, 그 아래로 한 줄씩 내려간다. */
  lane?: number;
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
  lane = 0,
  showExpressBadge,
  selectedStationName,
}: Props) {
  const typeClass = train.trainType === 'EXPRESS' ? 'train-flow--express' : 'train-flow--local';
  // 출발·진입은 글자로도 말한다 — 기호와 위치(구간 3분할)만으로 "이게 뭔가" 싶지 않게.
  const justDeparted = train.status === 'DEPARTED';
  const arriving = train.status === 'APPROACHING';
  const atSelected = train.currentStation.name === selectedStationName;

  const callout = justDeparted ? '출발' : arriving && !atSelected ? '진입' : null;
  // 내 역 진입은 시간 대신 "곧 도착" — 코앞이라 초는 못 믿으니 문구로(내 역 규칙과 통일).
  const timeText = arriving && atSelected ? '곧 도착' : formatRemaining(remainingSeconds);
  const timeAria = timeText === '곧 도착' || timeText === '—' ? timeText : `${timeText} 후`;
  const stateAria = justDeparted ? '방금 출발' : arriving ? '진입 중' : '이동 중';
  const base = `${selectedStationName} 방향, ${stateAria}, ${timeAria}`;
  const ariaLabel = delayed ? `${base}, 지연 중` : base;

  return (
    <div
      className={`train-flow ${typeClass}`}
      data-testid="train-flow"
      data-lane={lane}
      style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, '--lane': lane } as React.CSSProperties}
      aria-label={ariaLabel}
    >
      {callout && (
        <span className="train-flow__callout" aria-hidden="true">
          {callout}
        </span>
      )}
      <span className="train-flow__chevrons" aria-hidden="true">
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
