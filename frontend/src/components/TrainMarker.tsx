import type { Train } from '../types/subway';
import { formatRemaining } from '../utils/trackPosition';

type Props = {
  train: Train;
  leftPercent: number;
  showExpressBadge: boolean;
};

export function TrainMarker({ train, leftPercent, showExpressBadge }: Props) {
  return (
    <div className="train-marker" data-testid="train-marker" style={{ left: `${leftPercent}%` }}>
      <span className="train-marker__dot" aria-hidden="true" />
      <span className="train-marker__time">{formatRemaining(train.remainingSeconds)}</span>
      {showExpressBadge && <span className="train-marker__badge">급행</span>}
    </div>
  );
}
