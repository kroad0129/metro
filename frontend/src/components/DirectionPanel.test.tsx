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

const now = 1_000_000;

function train(over: Partial<Train> = {}): Train {
  return {
    trainId: 'T1',
    trainType: 'LOCAL',
    currentStation: stations[8], // order 9 = 전역(d=1)
    remainingSeconds: 120,
    status: 'TRAVELING',
    positionRatio: 0.5,
    anchorSinceMs: now, // 위상 관측 직후 → 가상 위치 = 위상 시작점
    ...over,
  };
}

function block(trains: Train[]): DirectionBlock {
  return { directionId: 'UP', directionName: '개화 방면', trains };
}

describe('DirectionPanel', () => {
  it('방향 이름을 표시한다', () => {
    render(<DirectionPanel stations={stations} selected={증미} block={block([])} nowMs={now} />);
    expect(screen.getByText('개화 방면')).toBeInTheDocument();
  });

  it('트랙에 역 3개를 표시하며 마지막이 선택한 역이다', () => {
    render(<DirectionPanel stations={stations} selected={증미} block={block([])} nowMs={now} />);
    const names = screen.getAllByTestId('track-station').map((el) => el.textContent);
    expect(names).toEqual(['역10', '역9', '역8']);
  });

  it('열차가 없으면 안내 문구를 보여준다', () => {
    render(<DirectionPanel stations={stations} selected={증미} block={block([])} nowMs={now} />);
    expect(screen.getByText('접근 중인 열차 없음')).toBeInTheDocument();
  });

  it('트랙 안의 열차를 점으로 표시하고 가상 남은 시간을 붙인다', () => {
    render(<DirectionPanel stations={stations} selected={증미} block={block([train()])} nowMs={now} />);
    const marker = screen.getByTestId('train-marker');
    expect(marker).toBeInTheDocument();
    expect(marker).toHaveTextContent('1분 50초'); // 1정거장 × 110초
  });

  it('열차 점의 위치는 가상 위치(위상 시작점)에서 시작한다', () => {
    // 전역(d=1) 운행, 앵커 직후 → gaps 1 → (1 - 1/2) = 50%
    render(<DirectionPanel stations={stations} selected={증미} block={block([train()])} nowMs={now} />);
    expect(screen.getByTestId('train-marker')).toHaveStyle({ left: '50%' });
  });

  it('시간이 흐르면 가상 열차가 전진한다', () => {
    // 운행 94초 중 47초 경과 → gaps 1 - 0.425 = 0.575 → left 71.25%
    render(
      <DirectionPanel stations={stations} selected={증미} block={block([train()])} nowMs={now + 47_000} />,
    );
    const left = parseFloat(screen.getByTestId('train-marker').style.left);
    expect(left).toBeGreaterThan(70);
    expect(left).toBeLessThan(73);
  });

  it('정차(ARRIVED) 중이면 시간이 흘러도 그 역에 서 있다', () => {
    render(
      <DirectionPanel
        stations={stations}
        selected={증미}
        block={block([train({ status: 'ARRIVED' })])}
        nowMs={now + 500_000}
      />,
    );
    expect(screen.getByTestId('train-marker')).toHaveStyle({ left: '50%' });
  });

  it('트랙 밖의 열차는 점 대신 텍스트로 안내한다', () => {
    const faraway = train({ currentStation: stations[20], remainingSeconds: 540 });
    render(<DirectionPanel stations={stations} selected={증미} block={block([faraway])} nowMs={now} />);
    expect(screen.queryByTestId('train-marker')).not.toBeInTheDocument();
    expect(screen.getByText('다음 열차 9분')).toBeInTheDocument();
  });

  it('트랙 밖 열차가 있으면 "접근 중인 열차 없음" 문구를 띄우지 않는다', () => {
    const faraway = train({ currentStation: stations[20], remainingSeconds: 540 });
    render(<DirectionPanel stations={stations} selected={증미} block={block([faraway])} nowMs={now} />);
    expect(screen.queryByText('접근 중인 열차 없음')).not.toBeInTheDocument();
  });

  it('급행 정차역에서는 급행 뱃지를 붙인다', () => {
    const express = train({ trainType: 'EXPRESS', currentStation: stations[11] });
    render(<DirectionPanel stations={stations} selected={염창} block={block([express])} nowMs={now} />);
    expect(screen.getByText('급행')).toBeInTheDocument();
  });

  it('일반 열차에는 급행 뱃지를 붙이지 않는다', () => {
    render(<DirectionPanel stations={stations} selected={증미} block={block([train()])} nowMs={now} />);
    expect(screen.queryByText('급행')).not.toBeInTheDocument();
  });
});
