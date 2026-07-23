import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Train } from '../types/subway';
import { TrainFlow } from './TrainFlow';

const train: Train = {
  trainId: 'T1',
  trainType: 'LOCAL',
  currentStation: { stationId: '9', name: '등촌', order: 9, isExpressStop: false },
  remainingSeconds: 95,
  status: 'DEPARTED',
  positionRatio: 0.5,
  stationsAway: 1,
  recptnAt: '2026-07-23T13:57:02+09:00',
};

function flow(over: Partial<Parameters<typeof TrainFlow>[0]> = {}) {
  return (
    <TrainFlow
      train={train}
      leftPercent={50}
      widthPercent={50}
      remainingSeconds={72}
      delayed={false}
      showExpressBadge={false}
      selectedStationName="증미"
      {...over}
    />
  );
}

describe('TrainFlow — 이동 중 구간의 흐르는 화살표', () => {
  it('구간 좌표(left·width)에 화살표 여러 개를 그린다', () => {
    render(flow());
    const el = screen.getByTestId('train-flow');
    expect(el).toHaveStyle({ left: '50%', width: '50%' });
    expect(el.querySelectorAll('.train-flow__chev').length).toBeGreaterThanOrEqual(3);
    expect(el.querySelector('.train-flow__chevrons')).toHaveAttribute('aria-hidden', 'true');
  });

  it('남은 시간을 초까지 표시한다', () => {
    render(flow());
    expect(screen.getByText('1분 12초')).toBeInTheDocument();
  });

  it('일반 열차는 초록, 급행 열차는 빨강 색상 클래스를 붙인다', () => {
    const { rerender } = render(flow());
    expect(screen.getByTestId('train-flow')).toHaveClass('train-flow--local');

    rerender(flow({ train: { ...train, trainType: 'EXPRESS' }, showExpressBadge: true }));
    expect(screen.getByTestId('train-flow')).toHaveClass('train-flow--express');
    expect(screen.getByText('급행')).toBeInTheDocument();
  });

  it('지연 중이면 "지연" 표시를 붙인다 — 오래 흐르는 화살표가 버그가 아님을 알린다', () => {
    render(flow({ delayed: true }));
    expect(screen.getByText('지연')).toBeInTheDocument();
    expect(screen.getByTestId('train-flow').getAttribute('aria-label')).toContain('지연 중');
  });

  it('aria-label이 이동 중임과 남은 시간을 말해준다', () => {
    render(flow());
    const label = screen.getByTestId('train-flow').getAttribute('aria-label') ?? '';
    expect(label).toContain('증미');
    expect(label).toContain('이동 중');
    expect(label).toContain('1분 12초');
  });
});
