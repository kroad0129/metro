import { describe, expect, it } from 'vitest';
import type { Train } from '../types/subway';
import type { PlacedTrain } from './panelLayout';
import { arrivalSlots, describePosition, groupMarks, stateLabel } from './trackMarks';

function train(over: Partial<Train> = {}): Train {
  return {
    trainId: '9127',
    trainType: 'LOCAL',
    currentStation: { stationId: '1009000909', name: '등촌', order: 9, isExpressStop: false },
    remainingSeconds: 95,
    status: 'ARRIVED',
    stationsAway: 1,
    recptnAt: '2026-07-23T13:57:02+09:00',
    ...over,
  };
}

describe('stateLabel', () => {
  it('일반 열차가 역에 서면 정차다', () => {
    expect(stateLabel(train({ trainType: 'LOCAL', status: 'ARRIVED' }))).toBe('정차');
  });

  it('급행이 급행 정차역에 서면 정차다', () => {
    const 가양 = { stationId: '1009000907', name: '가양', order: 7, isExpressStop: true };
    expect(stateLabel(train({ trainType: 'EXPRESS', status: 'ARRIVED', currentStation: 가양 }))).toBe(
      '정차',
    );
  });

  it('급행이 안 서는 역에 걸치면 정차가 아니라 통과다', () => {
    // 등촌(isExpressStop:false)을 급행이 지날 때 API가 잠깐 전역도착(ARRIVED)을 준다.
    expect(stateLabel(train({ trainType: 'EXPRESS', status: 'ARRIVED' }))).toBe('통과');
  });

  it('상태가 이동/진입/출발이면 종류와 무관하게 그대로다', () => {
    expect(stateLabel(train({ trainType: 'EXPRESS', status: 'TRAVELING' }))).toBe('이동');
    expect(stateLabel(train({ trainType: 'EXPRESS', status: 'APPROACHING' }))).toBe('진입');
    expect(stateLabel(train({ trainType: 'EXPRESS', status: 'DEPARTED' }))).toBe('출발');
  });
});

describe('describePosition', () => {
  it('급행이 통과하는 역은 통과로 읽어준다', () => {
    expect(describePosition(train({ trainType: 'EXPRESS', status: 'ARRIVED' }))).toBe('급행, 등촌 통과');
  });

  it('급행이 서는 역은 정차로 읽어준다', () => {
    const 가양 = { stationId: '1009000907', name: '가양', order: 7, isExpressStop: true };
    expect(describePosition(train({ trainType: 'EXPRESS', status: 'ARRIVED', currentStation: 가양 }))).toBe(
      '급행, 가양 정차',
    );
  });

  it('일반 열차는 그대로 정차로 읽어준다', () => {
    expect(describePosition(train({ trainType: 'LOCAL', status: 'ARRIVED' }))).toBe('일반, 등촌 정차');
  });
});

describe('groupMarks — 겹칠 때 급행 우선', () => {
  function atStation(over: Partial<Train>, left: number): PlacedTrain {
    return {
      train: train(over),
      remaining: 60,
      pos: { kind: 'station', left },
    };
  }

  it('일반 정차와 급행 통과가 같은 역에 겹치면 딱지는 통과가 우선이다', () => {
    // 일반이 등촌에 서 있고 급행이 그 위를 통과 — 둘 다 ARRIVED라 한 마크로 묶인다.
    const local = atStation({ trainId: 'L', trainType: 'LOCAL', status: 'ARRIVED' }, 50);
    const express = atStation({ trainId: 'E', trainType: 'EXPRESS', status: 'ARRIVED' }, 50);

    const groups = groupMarks([local, express]);

    expect(groups).toHaveLength(1);
    expect(groups[0].state).toBe('통과');
    expect(groups[0].types).toContain('LOCAL');
    expect(groups[0].types).toContain('EXPRESS');
  });

  it('겹치지 않으면 각자의 딱지를 유지한다', () => {
    const local = atStation({ trainId: 'L', trainType: 'LOCAL', status: 'ARRIVED' }, 20);
    const express = atStation({ trainId: 'E', trainType: 'EXPRESS', status: 'ARRIVED' }, 80);

    const groups = groupMarks([local, express]);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.state)).toEqual(['정차', '통과']);
  });
});

describe('arrivalSlots — 정직한 남은 시간 순서 (급행 추월 반영)', () => {
  it('서 있는 일반보다 앞서 달리는 급행이 먼저 온다', () => {
    // 대피로 등촌에 서 있는 일반(정직하게 95초 유지)보다, 앞서 달리는 급행(60초)이 위 칸에.
    const heldLocal: PlacedTrain = {
      train: train({ trainId: 'L', trainType: 'LOCAL', status: 'ARRIVED' }),
      remaining: 95,
      pos: { kind: 'station', left: 60 },
    };
    const movingExpress: PlacedTrain = {
      train: train({ trainId: 'E', trainType: 'EXPRESS', status: 'TRAVELING' }),
      remaining: 60,
      pos: { kind: 'segment', left: 62, width: 12 },
    };

    const slots = arrivalSlots([heldLocal, movingExpress], null, '증미');

    expect(slots[0]?.train.trainId).toBe('E'); // 급행 먼저(다음)
    expect(slots[1]?.train.trainId).toBe('L'); // 일반은 그다음
  });
});
