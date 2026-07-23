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
  stationsAway: 3,
  recptnAt: '2026-07-23T13:57:02+09:00',
};

const 내역 = { stationId: '8', name: '증미', order: 8, isExpressStop: false };

describe('TrainMarker', () => {
  it('점 오른쪽에 방향 화살표를 표시한다', () => {
    render(
      <TrainMarker
        train={train}
        leftPercent={50}
        delayed={false}
        remainingSeconds={110}
        showExpressBadge={false}
        selectedStationName="증미"
      />,
    );
    const marker = screen.getByTestId('train-marker');
    const arrow = marker.querySelector('.train-marker__arrow');
    expect(arrow).not.toBeNull();
    expect(arrow).toHaveAttribute('aria-hidden', 'true');
  });

  it('가상 모델의 남은 시간을 초까지 표시한다', () => {
    render(
      <TrainMarker
        train={train}
        leftPercent={50}
        delayed={false}
        remainingSeconds={110}
        showExpressBadge={false}
        selectedStationName="증미"
      />,
    );
    expect(screen.getByText('1분 50초')).toBeInTheDocument();
  });

  it('운행 중인 열차는 안내 글자를 띄우지 않는다', () => {
    render(
      <TrainMarker
        train={train}
        leftPercent={50}
        delayed={false}
        remainingSeconds={110}
        showExpressBadge={false}
        selectedStationName="증미"
      />,
    );
    expect(screen.queryByText('도착')).not.toBeInTheDocument();
    expect(screen.queryByText('곧 도착')).not.toBeInTheDocument();
  });

  it('중간 역에 서 있으면 그 역 위에 "정차"를 띄운다 — 내 역 도착과 헷갈리지 않게', () => {
    render(
      <TrainMarker
        train={{ ...train, status: 'ARRIVED' }}
        leftPercent={50}
        delayed={false}
        remainingSeconds={110}
        showExpressBadge={false}
        selectedStationName="증미"
      />,
    );
    expect(screen.getByText('정차')).toBeInTheDocument();
    expect(screen.getByText('1분 50초')).toBeInTheDocument(); // 시간은 그대로 보인다
  });

  it('내 역에 도착하면 시간 대신 "도착"을 띄운다', () => {
    render(
      <TrainMarker
        train={{ ...train, currentStation: 내역, status: 'ARRIVED' }}
        leftPercent={100}
        delayed={false}
        remainingSeconds={0}
        showExpressBadge={false}
        selectedStationName="증미"
      />,
    );
    expect(screen.getByText('도착')).toBeInTheDocument();
  });

  it('일반 열차는 초록, 급행 열차는 빨강 색상 클래스를 붙인다', () => {
    const { rerender } = render(
      <TrainMarker
        train={train}
        leftPercent={50}
        delayed={false}
        remainingSeconds={110}
        showExpressBadge={false}
        selectedStationName="증미"
      />,
    );
    expect(screen.getByTestId('train-marker')).toHaveClass('train-marker--local');

    rerender(
      <TrainMarker
        train={{ ...train, trainType: 'EXPRESS' }}
        leftPercent={50}
        delayed={false}
        remainingSeconds={110}
        showExpressBadge={true}
        selectedStationName="증미"
      />,
    );
    expect(screen.getByTestId('train-marker')).toHaveClass('train-marker--express');
  });

  it('지연 중이면 "지연" 표시를 붙인다 — 멈춘 점이 버그가 아님을 알린다', () => {
    render(
      <TrainMarker
        train={train}
        leftPercent={50}
        delayed={true}
        remainingSeconds={110}
        showExpressBadge={false}
        selectedStationName="증미"
      />,
    );
    expect(screen.getByText('지연')).toBeInTheDocument();
    expect(screen.getByTestId('train-marker').getAttribute('aria-label')).toContain('지연 중');
  });

  it('aria-label에 선택한 역 이름과 남은 시간이 포함된다', () => {
    render(
      <TrainMarker
        train={train}
        leftPercent={50}
        delayed={false}
        remainingSeconds={110}
        showExpressBadge={false}
        selectedStationName="증미"
      />,
    );
    const label = screen.getByTestId('train-marker').getAttribute('aria-label') ?? '';
    expect(label).toContain('증미');
    expect(label).toContain('1분 50초');
  });
});
