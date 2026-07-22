import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Train } from '../types/subway';
import { TrainMarker } from './TrainMarker';

const train: Train = {
  trainId: 'T1',
  trainType: 'LOCAL',
  currentStation: { stationId: '1', name: '역1', order: 1, isExpressStop: false },
  remainingSeconds: 385,
  status: 'TRAVELING',
  positionRatio: 0.5,
};

const updatedAt = '2026-07-22T14:00:00+09:00';
const nowMs = new Date(updatedAt).getTime();

describe('TrainMarker', () => {
  it('점 오른쪽에 방향 화살표를 표시한다', () => {
    render(
      <TrainMarker
        train={train}
        leftPercent={50}
        showExpressBadge={false}
        nowMs={nowMs}
        updatedAt={updatedAt}
        selectedStationName="증미"
      />,
    );
    const marker = screen.getByTestId('train-marker');
    const arrow = marker.querySelector('.train-marker__arrow');
    expect(arrow).not.toBeNull();
    expect(arrow).toHaveAttribute('aria-hidden', 'true');
  });

  it('aria-label에 선택한 역 이름과 남은 시간이 포함된다', () => {
    render(
      <TrainMarker
        train={train}
        leftPercent={50}
        showExpressBadge={false}
        nowMs={nowMs}
        updatedAt={updatedAt}
        selectedStationName="증미"
      />,
    );
    const marker = screen.getByTestId('train-marker');
    const label = marker.getAttribute('aria-label') ?? '';
    expect(label).toContain('증미');
    expect(label).toContain('6분 25초');
  });
});
