import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MockPage } from './MockPage';

describe('MockPage — 시나리오 조합 목업 화면', () => {
  it('양방향 패널과 시나리오 체크박스를 보여준다', () => {
    render(<MockPage />);
    expect(screen.getByText('개화 방면')).toBeInTheDocument();
    expect(screen.getByText('중앙보훈병원 방면')).toBeInTheDocument();
    expect(screen.getByLabelText(/전역 정차/)).toBeInTheDocument();
    expect(screen.getByLabelText(/같은 구간 일반\+급행/)).toBeInTheDocument();
  });

  it('기본 조합으로 이동 중 열차가 바로 보인다 — 빈 화면으로 시작하지 않는다', () => {
    render(<MockPage />);
    expect(screen.getAllByTestId('train-flow').length).toBeGreaterThanOrEqual(1);
  });

  it('겹침 시나리오를 켜면 아랫줄(lane 1)이 생긴다', async () => {
    render(<MockPage />);
    await userEvent.click(screen.getByLabelText(/같은 구간 일반\+급행/));
    const lanes = screen.getAllByTestId('train-flow').map((f) => f.dataset.lane);
    expect(lanes).toContain('1');
  });

  it('모두 해제하고 운행 종료를 켜면 양방향에 첫차 안내가 뜬다', async () => {
    render(<MockPage />);
    await userEvent.click(screen.getByRole('button', { name: '모두 해제' }));
    await userEvent.click(screen.getByLabelText(/운행 종료/));
    // 라벨이 아니라 패널 안내 문구(시각 포함)만 센다 — 양방향 각각 1개
    expect(screen.getAllByText(/운행 종료 — 첫차 \d{2}:\d{2}/)).toHaveLength(2);
  });

  it('지연 시나리오를 켜면 지연 배지가 붙는다', async () => {
    render(<MockPage />);
    await userEvent.click(screen.getByRole('button', { name: '모두 해제' }));
    await userEvent.click(screen.getByLabelText(/지연 — 추정 소요 초과/));
    expect(screen.getByText('지연')).toBeInTheDocument();
  });
});
