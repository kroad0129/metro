import type { ArrivalSlot } from '../utils/trackMarks';

const LABELS = ['다음', '그다음'];

/**
 * 도착 안내 — 방면 이름 밑 가로 한 줄에 곧 올 열차 둘.
 *
 * 시간을 열차마다 붙이면 가까이 붙었을 때 글자끼리 먹는다. 트랙은 위치와 상태만 보여주고
 * 시간은 여기 모은다. 칸 너비를 반반으로 못 박고 숫자를 고정폭으로 써서, 초가 바뀌거나
 * 열차가 없어져도 자리가 흔들리지 않는다.
 */
export function ArrivalRow({ slots }: { slots: ArrivalSlot[] }) {
  return (
    <div className="arrivals">
      {slots.map((slot, index) => {
        const kind = !slot ? 'empty' : slot.train.trainType === 'EXPRESS' ? 'express' : 'local';
        return (
          <div key={index} className={`arrival arrival--${kind}`} data-testid="arrival">
            <span className="arrival__label">{LABELS[index] ?? ''}</span>
            <span className="arrival__body">
              <span className="arrival__time">{slot ? slot.text : '—'}</span>
              {slot?.train.trainType === 'EXPRESS' && <span className="arrival__tag">급행</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
