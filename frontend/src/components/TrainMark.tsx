import type { TrainType } from '../types/subway';

const COLOR: Record<TrainType, string> = { LOCAL: '#1a7f37', EXPRESS: '#c8102e' };

/**
 * 열차 하나(또는 같은 자리에 겹친 둘) — 정차 중이면 라인 위의 점, 이동 중이면 흐르는 화살표.
 *
 * 겹친 경우(일반 + 급행)는 마크 하나를 두 색으로 그린다: 점은 반은 초록 반은 빨강,
 * 화살표는 두 색의 흐름이 반 박자씩 어긋나 번갈아 지나간다. 줄이 늘지 않으니 화면 높이도
 * 변하지 않는다.
 */
export function TrainMark({
  moving,
  flip,
  types,
}: {
  moving: boolean;
  flip: boolean;
  types: TrainType[];
}) {
  if (!moving) {
    const [a, b] = [COLOR[types[0]], COLOR[types[1] ?? types[0]]];
    return (
      <span
        className="track__dot"
        aria-hidden="true"
        style={{ background: `linear-gradient(90deg, ${a} 0 50%, ${b} 50% 100%)` }}
      />
    );
  }

  return (
    <span className="track__arrows-stack" aria-hidden="true">
      {types.map((type, i) => (
        <Arrows key={type} flip={flip} color={COLOR[type]} offset={i} />
      ))}
    </span>
  );
}

/**
 * 화살표는 글자가 아니라 CSS 도형으로 그린다 — 글꼴마다 다른 글자의 세로 중심 때문에
 * 마크가 선 위에서 어긋나 보이는 것을 막는다(도형은 상자 한가운데에 정확히 놓인다).
 */
function Arrows({ flip, color, offset }: { flip: boolean; color: string; offset: number }) {
  return (
    <span
      className={flip ? 'track__arrows track__arrows--flip' : 'track__arrows'}
      style={{ color, ['--wave-offset' as string]: `${offset * 0.7}s` }}
    >
      <span className="track__arrow" />
      <span className="track__arrow" />
      <span className="track__arrow" />
    </span>
  );
}
