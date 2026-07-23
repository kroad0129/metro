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

  it('기본 조합에서 열차 마크가 바로 보인다 — 빈 화면으로 시작하지 않는다', () => {
    render(<MockPage />);
    expect(screen.getAllByTestId('track-mark').length).toBeGreaterThanOrEqual(1);
  });

  it('아래 방향 패널은 진행 방향이 반전된다 — 선택역이 왼쪽 끝', () => {
    render(<MockPage />);
    const panels = screen.getAllByText('개화 방면')[0].parentElement!.parentElement!.children;
    const [up, down] = panels;
    const pick = (el: Element) =>
      [...el.querySelectorAll('[data-testid="track-station"]')].find(
        (n) => n.textContent === '증미',
      ) as HTMLElement;
    expect(pick(up).style.left).toBe('100%');
    expect(pick(down).style.left).toBe('0%');
  });

  it('겹치지 않는 열차는 각자의 마크로 남는다', async () => {
    render(<MockPage />);
    await userEvent.click(screen.getByRole('button', { name: '모두 해제' }));
    await userEvent.click(screen.getByLabelText(/전역 정차/));
    await userEvent.click(screen.getByLabelText(/^이동 중 — 전전역/));
    const marks = screen.getAllByTestId('track-mark');
    expect(marks).toHaveLength(2);
    expect(marks.every((m) => (m as HTMLElement).dataset.types?.split(',').length === 1)).toBe(true);
  });

  it('같은 자리에 겹친 일반+급행은 마크 하나로 묶여 두 색이 된다 — 줄이 늘지 않는다', async () => {
    render(<MockPage />);
    await userEvent.click(screen.getByRole('button', { name: '모두 해제' }));
    await userEvent.click(screen.getByLabelText(/같은 구간 일반\+급행/));
    const marks = screen.getAllByTestId('track-mark');
    expect(marks).toHaveLength(1);
    expect((marks[0] as HTMLElement).dataset.types).toContain('LOCAL');
    expect((marks[0] as HTMLElement).dataset.types).toContain('EXPRESS');
  });

  it('같은 역 정차+진입은 정차와 이동이라 묶이지 않는다 — 각자 그대로', async () => {
    render(<MockPage />);
    await userEvent.click(screen.getByRole('button', { name: '모두 해제' }));
    await userEvent.click(screen.getByLabelText(/같은 역 정차\+진입/));
    expect(screen.getAllByTestId('track-mark')).toHaveLength(2);
  });

  it('진입·출발·정차는 글자로도 표시된다', async () => {
    render(<MockPage />);
    await userEvent.click(screen.getByRole('button', { name: '모두 해제' }));
    await userEvent.click(screen.getByLabelText(/전역 정차/));
    expect(screen.getByText('정차')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText(/전역 진입/));
    expect(screen.getByText('진입')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText(/막 출발/));
    expect(screen.getByText('출발')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText(/^이동 중 — 전전역/));
    expect(screen.getByText('이동')).toBeInTheDocument();
  });

  it('도착 안내는 방면 이름 밑에 늘 두 칸이다 — 열차가 없어도 구조가 그대로', async () => {
    render(<MockPage />);
    expect(screen.getAllByTestId('arrival')).toHaveLength(4); // 양방향 × 2칸
    await userEvent.click(screen.getByRole('button', { name: '모두 해제' }));
    expect(screen.getAllByTestId('arrival')).toHaveLength(4);
  });

  it('도착 안내는 임박한 순으로 채워지고 급행은 태그가 붙는다', async () => {
    render(<MockPage />);
    await userEvent.click(screen.getByRole('button', { name: '모두 해제' }));
    await userEvent.click(screen.getByLabelText(/급행 내 역 진입/));
    const first = screen.getAllByTestId('arrival')[0];
    expect(first).toHaveTextContent('곧 도착');
    expect(first).toHaveTextContent('급행');
    expect(first).toHaveClass('arrival--express');
  });

  it('1분 이하로 남으면 초를 세지 않고 "곧 도착"이라고 한다', async () => {
    render(<MockPage />);
    await userEvent.click(screen.getByRole('button', { name: '모두 해제' }));
    await userEvent.click(screen.getByLabelText(/전역 정차/)); // 남은 60초
    expect(screen.getAllByTestId('arrival')[0]).toHaveTextContent('곧 도착');
  });

  it('급행 단독 열차도 목업에 있다', async () => {
    render(<MockPage />);
    await userEvent.click(screen.getByRole('button', { name: '모두 해제' }));
    await userEvent.click(screen.getByLabelText(/급행 이동 중/));
    expect(screen.getByTestId('track-mark').dataset.types).toBe('EXPRESS');
  });

  it('열차가 없으면 마크도 없지만 트랙 줄은 그대로 남는다 — 구조가 변하지 않는다', async () => {
    render(<MockPage />);
    const names = screen.getAllByTestId('track-station').length;
    await userEvent.click(screen.getByRole('button', { name: '모두 해제' }));
    expect(screen.queryAllByTestId('track-mark')).toHaveLength(0);
    expect(screen.getAllByTestId('track-station')).toHaveLength(names);
  });
});
