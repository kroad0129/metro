import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DirectionBlock, Station, Train } from '../types/subway';
import { DirectionPanel } from './DirectionPanel';

const stations: Station[] = Array.from({ length: 38 }, (_, i) => ({
  stationId: `${1009000900 + i + 1}`,
  name: `역${i + 1}`,
  order: i + 1,
  isExpressStop: i + 1 === 10,
}));

const 증미 = stations[7];
const 염창 = stations[9];

function train(over: Partial<Train> = {}): Train {
  return {
    trainId: 'T1',
    trainType: 'LOCAL',
    currentStation: stations[8], // order 9
    remainingSeconds: 120,
    status: 'TRAVELING',
    positionRatio: 0.5,
    ...over,
  };
}

function block(trains: Train[]): DirectionBlock {
  return { directionId: 'UP', directionName: '개화 방면', trains };
}

const updatedAt = '2026-07-22T14:00:00+09:00';
const nowMs = new Date(updatedAt).getTime();

describe('DirectionPanel', () => {
  it('방향 이름을 표시한다', () => {
    render(
      <DirectionPanel stations={stations} selected={증미} block={block([])} nowMs={nowMs} updatedAt={updatedAt} />,
    );
    expect(screen.getByText('개화 방면')).toBeInTheDocument();
  });

  it('트랙에 역 5개를 표시하며 마지막이 선택한 역이다', () => {
    render(
      <DirectionPanel stations={stations} selected={증미} block={block([])} nowMs={nowMs} updatedAt={updatedAt} />,
    );
    const names = screen.getAllByTestId('track-station').map((el) => el.textContent);
    expect(names).toEqual(['역12', '역11', '역10', '역9', '역8']);
  });

  it('열차가 없으면 안내 문구를 보여준다', () => {
    render(
      <DirectionPanel stations={stations} selected={증미} block={block([])} nowMs={nowMs} updatedAt={updatedAt} />,
    );
    expect(screen.getByText('접근 중인 열차 없음')).toBeInTheDocument();
  });

  it('트랙 안의 열차를 점으로 표시하고 남은 시간을 붙인다', () => {
    render(
      <DirectionPanel
        stations={stations}
        selected={증미}
        block={block([train()])}
        nowMs={nowMs}
        updatedAt={updatedAt}
      />,
    );
    const marker = screen.getByTestId('train-marker');
    expect(marker).toBeInTheDocument();
    expect(marker).toHaveTextContent('2분');
  });

  it('열차 점의 left 위치를 퍼센트로 지정한다', () => {
    render(
      <DirectionPanel
        stations={stations}
        selected={증미}
        block={block([train()])}
        nowMs={nowMs}
        updatedAt={updatedAt}
      />,
    );
    expect(screen.getByTestId('train-marker')).toHaveStyle({ left: '87.5%' });
  });

  it('트랙 밖의 열차는 점 대신 텍스트로 안내한다', () => {
    const faraway = train({ currentStation: stations[20], remainingSeconds: 540 });
    render(
      <DirectionPanel
        stations={stations}
        selected={증미}
        block={block([faraway])}
        nowMs={nowMs}
        updatedAt={updatedAt}
      />,
    );
    expect(screen.queryByTestId('train-marker')).not.toBeInTheDocument();
    expect(screen.getByText('다음 열차 9분')).toBeInTheDocument();
  });

  it('트랙 밖 열차가 있으면 "접근 중인 열차 없음" 문구를 띄우지 않는다', () => {
    const faraway = train({ currentStation: stations[20], remainingSeconds: 540 });
    render(
      <DirectionPanel
        stations={stations}
        selected={증미}
        block={block([faraway])}
        nowMs={nowMs}
        updatedAt={updatedAt}
      />,
    );
    expect(screen.queryByText('접근 중인 열차 없음')).not.toBeInTheDocument();
  });

  it('급행 정차역에서는 급행 뱃지를 붙인다', () => {
    const express = train({ trainType: 'EXPRESS', currentStation: stations[11] });
    render(
      <DirectionPanel
        stations={stations}
        selected={염창}
        block={block([express])}
        nowMs={nowMs}
        updatedAt={updatedAt}
      />,
    );
    expect(screen.getByText('급행')).toBeInTheDocument();
  });

  it('일반 열차에는 급행 뱃지를 붙이지 않는다', () => {
    render(
      <DirectionPanel
        stations={stations}
        selected={증미}
        block={block([train()])}
        nowMs={nowMs}
        updatedAt={updatedAt}
      />,
    );
    expect(screen.queryByText('급행')).not.toBeInTheDocument();
  });

  it('도착 시간을 모르는 열차는 대시로 표시한다', () => {
    render(
      <DirectionPanel
        stations={stations}
        selected={증미}
        block={block([train({ remainingSeconds: null })])}
        nowMs={nowMs}
        updatedAt={updatedAt}
      />,
    );
    expect(screen.getByTestId('train-marker')).toHaveTextContent('—');
  });
});
