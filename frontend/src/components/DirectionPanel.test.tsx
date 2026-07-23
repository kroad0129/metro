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

const recptnAt = '2026-07-23T13:57:02+09:00';
const now = Date.parse(recptnAt);

function train(over: Partial<Train> = {}): Train {
  return {
    trainId: 'T1',
    trainType: 'LOCAL',
    currentStation: stations[8], // order 9
    remainingSeconds: 120,
    status: 'TRAVELING',
    positionRatio: 0.5,
    stationsAway: 1, // 전역
    recptnAt,
    segmentStartedAtMs: now, // 방금 이 구간에 들어왔다
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

  it('열차가 없어도 시간표의 다음 출발이 있으면 시각을 알려준다', () => {
    const withSchedule = {
      ...block([]),
      nextSchedule: { departureAt: '2026-07-23T23:47:10+09:00', firstOfDay: false },
    };
    render(<DirectionPanel stations={stations} selected={증미} block={withSchedule} nowMs={now} />);
    expect(screen.getByText('다음 열차 23:47 출발 (시간표 기준)')).toBeInTheDocument();
    expect(screen.queryByText('접근 중인 열차 없음')).not.toBeInTheDocument();
  });

  it('운행이 끝났으면 첫차를 안내한다', () => {
    const withFirst = {
      ...block([]),
      nextSchedule: { departureAt: '2026-07-24T05:40:50+09:00', firstOfDay: true },
    };
    render(<DirectionPanel stations={stations} selected={증미} block={withFirst} nowMs={now} />);
    expect(screen.getByText('운행 종료 — 첫차 05:40 (시간표 기준)')).toBeInTheDocument();
  });

  it('시간표 조회가 실패했으면(null) 기존 문구를 보여준다', () => {
    const failed = { ...block([]), nextSchedule: null };
    render(<DirectionPanel stations={stations} selected={증미} block={failed} nowMs={now} />);
    expect(screen.getByText('접근 중인 열차 없음')).toBeInTheDocument();
  });

  it('트랙 안의 열차를 점으로 표시하고 남은 시간을 붙인다', () => {
    render(<DirectionPanel stations={stations} selected={증미} block={block([train()])} nowMs={now} />);
    const marker = screen.getByTestId('train-marker');
    expect(marker).toBeInTheDocument();
    expect(marker).toHaveTextContent('2분'); // barvlDt 120초
  });

  it('점 위치는 보고된 정거장 수(ordkey)에서 시작한다', () => {
    // 1정거장 남음, 트랙 간격 2개 → 50%
    render(<DirectionPanel stations={stations} selected={증미} block={block([train()])} nowMs={now} />);
    expect(screen.getByTestId('train-marker')).toHaveStyle({ left: '50%' });
  });

  it('시간이 흐르면 열차가 전진하고 남은 시간도 줄어든다', () => {
    // 120 → 24(=다음 위상 예상치) 구간의 절반이 지난 시점
    const later = now + 48_000;
    render(<DirectionPanel stations={stations} selected={증미} block={block([train()])} nowMs={later} />);
    const marker = screen.getByTestId('train-marker');
    const left = parseFloat(marker.style.left);
    expect(left).toBeGreaterThan(50);
    expect(left).toBeLessThan(100);
    expect(marker).toHaveTextContent('1분 12초');
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

  it('전역에서 오래 지연돼도 도착했다고 하지 않는다', () => {
    render(
      <DirectionPanel stations={stations} selected={증미} block={block([train()])} nowMs={now + 500_000} />,
    );
    const marker = screen.getByTestId('train-marker');
    expect(parseFloat(marker.style.left)).toBeLessThan(100);
    expect(marker).not.toHaveTextContent('곧 도착');
  });

  it('트랙 밖의 열차는 점 대신 텍스트로 안내한다', () => {
    const faraway = train({ currentStation: stations[20], remainingSeconds: 540, stationsAway: 5 });
    render(<DirectionPanel stations={stations} selected={증미} block={block([faraway])} nowMs={now} />);
    expect(screen.queryByTestId('train-marker')).not.toBeInTheDocument();
    expect(screen.getByText('다음 열차 9분')).toBeInTheDocument();
  });

  it('트랙 밖 열차가 있으면 "접근 중인 열차 없음" 문구를 띄우지 않는다', () => {
    const faraway = train({ currentStation: stations[20], remainingSeconds: 540, stationsAway: 5 });
    render(<DirectionPanel stations={stations} selected={증미} block={block([faraway])} nowMs={now} />);
    expect(screen.queryByText('접근 중인 열차 없음')).not.toBeInTheDocument();
  });

  it('급행 정차역에서는 급행 뱃지를 붙인다', () => {
    const express = train({ trainType: 'EXPRESS', currentStation: stations[11], stationsAway: 2 });
    render(<DirectionPanel stations={stations} selected={염창} block={block([express])} nowMs={now} />);
    expect(screen.getByText('급행')).toBeInTheDocument();
  });

  it('일반 열차에는 급행 뱃지를 붙이지 않는다', () => {
    render(<DirectionPanel stations={stations} selected={증미} block={block([train()])} nowMs={now} />);
    expect(screen.queryByText('급행')).not.toBeInTheDocument();
  });
});
