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

  it('이동 중(운행중·출발) 열차는 구간에 화살표 흐름으로 그린다 — 점 위치를 주장하지 않는다', () => {
    // 전역(d=1)에서 이동 중 → 전역~내 역 구간(트랙 오른쪽 절반)
    render(<DirectionPanel stations={stations} selected={증미} block={block([train()])} nowMs={now} />);
    expect(screen.queryByTestId('train-marker')).not.toBeInTheDocument();
    const flow = screen.getByTestId('train-flow');
    expect(flow).toHaveStyle({ left: '50%', width: '50%' });
    expect(flow).toHaveTextContent('2분'); // barvlDt 120초
  });

  it('시간이 흐르면 남은 시간은 줄지만 구간은 그대로다', () => {
    const later = now + 48_000;
    render(<DirectionPanel stations={stations} selected={증미} block={block([train()])} nowMs={later} />);
    const flow = screen.getByTestId('train-flow');
    expect(flow).toHaveStyle({ left: '50%', width: '50%' });
    expect(flow).toHaveTextContent('1분 12초');
  });

  it('정차(ARRIVED) 중이면 그 역 위에 점으로 선다', () => {
    render(
      <DirectionPanel
        stations={stations}
        selected={증미}
        block={block([train({ status: 'ARRIVED' })])}
        nowMs={now + 500_000}
      />,
    );
    expect(screen.getByTestId('train-marker')).toHaveStyle({ left: '50%' });
    expect(screen.queryByTestId('train-flow')).not.toBeInTheDocument();
  });

  it('진입(APPROACHING) 중이면 그 역 위 맥동하는 점이다', () => {
    render(
      <DirectionPanel
        stations={stations}
        selected={증미}
        block={block([train({ status: 'APPROACHING' })])}
        nowMs={now}
      />,
    );
    const marker = screen.getByTestId('train-marker');
    expect(marker).toHaveStyle({ left: '50%' });
    expect(marker).toHaveClass('train-marker--arriving');
  });

  it('전역에서 오래 지연돼도 도착했다고 하지 않는다', () => {
    render(
      <DirectionPanel stations={stations} selected={증미} block={block([train()])} nowMs={now + 500_000} />,
    );
    const flow = screen.getByTestId('train-flow');
    expect(flow).not.toHaveTextContent('곧 도착');
    expect(screen.queryByText('도착')).not.toBeInTheDocument();
  });

  it('내 역을 출발한 열차는 그리지도, 다음 열차로 세지도 않는다', () => {
    const passed = train({ currentStation: 증미, stationsAway: 0, status: 'DEPARTED' });
    render(<DirectionPanel stations={stations} selected={증미} block={block([passed])} nowMs={now} />);
    expect(screen.queryByTestId('train-marker')).not.toBeInTheDocument();
    expect(screen.queryByTestId('train-flow')).not.toBeInTheDocument();
    expect(screen.queryByText(/다음 열차/)).not.toBeInTheDocument();
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

  it('같은 구간을 달리는 두 열차(일반 뒤 급행)는 아랫줄로 나뉜다 — 겹침 방지', () => {
    const local = train(); // 전역→내 역 구간
    const express = train({ trainId: 'T2', trainType: 'EXPRESS' });
    render(
      <DirectionPanel stations={stations} selected={증미} block={block([local, express])} nowMs={now} />,
    );
    const flows = screen.getAllByTestId('train-flow');
    expect(flows.map((f) => f.dataset.lane)).toEqual(['0', '1']);
  });

  it('떨어진 구간의 열차들은 모두 첫 줄이다', () => {
    const near = train(); // 전역→내 역
    const far = train({ trainId: 'T2', stationsAway: 2, currentStation: stations[9] }); // 전전역→전역
    render(
      <DirectionPanel stations={stations} selected={증미} block={block([near, far])} nowMs={now} />,
    );
    const flows = screen.getAllByTestId('train-flow');
    expect(flows.map((f) => f.dataset.lane)).toEqual(['0', '0']);
  });

  it('정차한 점과 같은 역에 걸친 다른 열차도 아랫줄로 나뉜다', () => {
    const parked = train({ status: 'ARRIVED' }); // 전역(50%)에 정차한 점
    const arriving = train({ trainId: 'T2', status: 'APPROACHING' }); // 같은 역에 진입
    render(
      <DirectionPanel stations={stations} selected={증미} block={block([parked, arriving])} nowMs={now} />,
    );
    const markers = screen.getAllByTestId('train-marker');
    expect(markers.map((m) => m.dataset.lane)).toEqual(['0', '1']);
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
