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
    stationsAway: 1, // 전역
    recptnAt,
    segmentStartedAtMs: now, // 방금 이 구간에 들어왔다
    ...over,
  };
}

function block(trains: Train[]): DirectionBlock {
  return { directionId: 'UP', directionName: '개화 방면', trains };
}

const leftOf = (el: HTMLElement) => parseFloat(el.style.left);

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

  it('flip이면 좌우가 뒤집혀 선택역이 왼쪽 끝에 온다 — 두 방향이 마주 보게', () => {
    const { rerender } = render(
      <DirectionPanel stations={stations} selected={증미} block={block([])} nowMs={now} />,
    );
    const pickSelected = () =>
      screen.getAllByTestId('track-station').find((n) => n.textContent === '역8') as HTMLElement;
    expect(pickSelected().style.left).toBe('100%');

    rerender(
      <DirectionPanel stations={stations} selected={증미} block={block([])} nowMs={now} flip />,
    );
    expect(pickSelected().style.left).toBe('0%');
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

  it('운행 중(TRAVELING) 열차는 구간 가운데 ⅓에 마크로 그려진다', () => {
    // 전역(d=1)에서 이동 중 → 전역~내 역 구간(50~100%)의 가운데 ⅓
    render(<DirectionPanel stations={stations} selected={증미} block={block([train()])} nowMs={now} />);
    const mark = screen.getByTestId('track-mark');
    expect(leftOf(mark)).toBeCloseTo(75, 1);
    expect(mark).toHaveTextContent('이동');
  });

  it('막 출발(DEPARTED)한 열차는 구간 첫 ⅓이고 "출발"이 붙는다', () => {
    render(
      <DirectionPanel
        stations={stations}
        selected={증미}
        block={block([train({ status: 'DEPARTED' })])}
        nowMs={now}
      />,
    );
    const mark = screen.getByTestId('track-mark');
    expect(leftOf(mark)).toBeCloseTo(58.3, 1);
    expect(mark).toHaveTextContent('출발');
  });

  it('전역 진입(APPROACHING d=1)은 전전역→전역 구간의 마지막 ⅓이고 "진입"이 붙는다', () => {
    render(
      <DirectionPanel
        stations={stations}
        selected={증미}
        block={block([train({ status: 'APPROACHING' })])}
        nowMs={now}
      />,
    );
    const mark = screen.getByTestId('track-mark');
    expect(leftOf(mark)).toBeCloseTo(41.7, 1);
    expect(mark).toHaveTextContent('진입');
  });

  it('정차(ARRIVED) 중이면 그 역 위에 서고 "정차"가 붙는다', () => {
    render(
      <DirectionPanel
        stations={stations}
        selected={증미}
        block={block([train({ status: 'ARRIVED' })])}
        nowMs={now + 500_000}
      />,
    );
    const mark = screen.getByTestId('track-mark');
    expect(leftOf(mark)).toBe(50);
    expect(mark).toHaveTextContent('정차');
  });

  it('flip이면 마크 좌표도 반전된다', () => {
    render(
      <DirectionPanel stations={stations} selected={증미} block={block([train()])} nowMs={now} flip />,
    );
    expect(leftOf(screen.getByTestId('track-mark'))).toBeCloseTo(25, 1);
  });

  it('시간이 흘러도 마크 자리는 그대로다 — 위치는 상태로만 정해진다', () => {
    render(
      <DirectionPanel stations={stations} selected={증미} block={block([train()])} nowMs={now + 48_000} />,
    );
    expect(leftOf(screen.getByTestId('track-mark'))).toBeCloseTo(75, 1);
  });

  it('내 역을 출발한 열차는 그리지도, 도착 안내에 세지도 않는다', () => {
    const passed = train({ currentStation: 증미, stationsAway: 0, status: 'DEPARTED' });
    render(<DirectionPanel stations={stations} selected={증미} block={block([passed])} nowMs={now} />);
    expect(screen.queryByTestId('track-mark')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('arrival').map((a) => a.textContent)).toEqual(['다음—', '그다음—']);
  });

  it('같은 자리에 겹친 일반+급행은 마크 하나로 묶여 두 색이 된다 — 줄이 늘지 않는다', () => {
    const local = train();
    const express = train({ trainId: 'T2', trainType: 'EXPRESS' });
    render(
      <DirectionPanel stations={stations} selected={증미} block={block([local, express])} nowMs={now} />,
    );
    const marks = screen.getAllByTestId('track-mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].dataset.types).toContain('LOCAL');
    expect(marks[0].dataset.types).toContain('EXPRESS');
  });

  it('떨어져 있는 열차는 각자의 마크로 남는다', () => {
    const near = train();
    const far = train({ trainId: 'T2', stationsAway: 2, currentStation: stations[9] });
    render(
      <DirectionPanel stations={stations} selected={증미} block={block([near, far])} nowMs={now} />,
    );
    expect(screen.getAllByTestId('track-mark')).toHaveLength(2);
  });

  it('도착 안내는 늘 두 칸이고 임박한 순으로 채워진다', () => {
    const near = train({ remainingSeconds: 300, stationsAway: 2, currentStation: stations[9] });
    const nearer = train({ trainId: 'T2' }); // 120초
    render(
      <DirectionPanel stations={stations} selected={증미} block={block([near, nearer])} nowMs={now} />,
    );
    const arrivals = screen.getAllByTestId('arrival');
    expect(arrivals).toHaveLength(2);
    expect(arrivals[0]).toHaveTextContent('2분');
    expect(arrivals[1]).toHaveTextContent('5분');
  });

  it('1분 이하로 남으면 초를 세지 않고 "곧 도착"이라고 한다', () => {
    render(
      <DirectionPanel
        stations={stations}
        selected={증미}
        block={block([train({ remainingSeconds: 55 })])}
        nowMs={now}
      />,
    );
    expect(screen.getAllByTestId('arrival')[0]).toHaveTextContent('곧 도착');
  });

  it('급행은 도착 안내에서 색 구분과 "급행" 태그를 받는다', () => {
    const express = train({ trainType: 'EXPRESS', currentStation: stations[11], stationsAway: 2 });
    render(<DirectionPanel stations={stations} selected={염창} block={block([express])} nowMs={now} />);
    const first = screen.getAllByTestId('arrival')[0];
    expect(first).toHaveClass('arrival--express');
    expect(first).toHaveTextContent('급행');
  });

  it('일반 열차에는 급행 태그를 붙이지 않는다', () => {
    render(<DirectionPanel stations={stations} selected={증미} block={block([train()])} nowMs={now} />);
    expect(screen.queryByText('급행')).not.toBeInTheDocument();
  });
});
