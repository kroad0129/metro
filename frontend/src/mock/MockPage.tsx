import { useMemo, useState } from 'react';
import { DirectionPanel } from '../components/DirectionPanel';
import { useNow } from '../hooks/useNow';
import { combineScenarios, MOCK_SELECTED, MOCK_STATIONS, SCENARIOS } from './scenarios';
import '../App.css';
import './MockPage.css';

/** 처음 열었을 때 화면이 살아 있도록 보여주는 대표 조합. */
const DEFAULT_IDS = ['이동-전역', '정차-전역', '하행-세트'];

/**
 * 목업 모드 (`?mock`) — 실호출 없이 가짜 데이터로 화면 상태를 조합해 본다.
 *
 * 실제 화면과 **같은 컴포넌트**(DirectionPanel 이하)를 쓰므로, 여기서 검수한 모양이
 * 그대로 실화면이다. 패널은 위에 고정(sticky)되고 시나리오는 아래 다열 그리드라
 * 스크롤 없이 토글하며 결과를 바로 본다.
 */
export function MockPage() {
  const [baseMs] = useState(() => Date.now());
  const [selected, setSelected] = useState<Set<string>>(() => new Set(DEFAULT_IDS));
  const nowMs = useNow();

  const { up, down } = useMemo(() => combineScenarios([...selected], baseMs), [selected, baseMs]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, typeof SCENARIOS>();
    for (const s of SCENARIOS) {
      const list = byGroup.get(s.group) ?? [];
      list.push(s);
      byGroup.set(s.group, list);
    }
    return [...byGroup.entries()];
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const common = { stations: MOCK_STATIONS, selected: MOCK_SELECTED, nowMs };

  return (
    <main className="app mock-page">
      <div className="mock-page__stage">
        <div className="app__directions">
          <DirectionPanel {...common} block={up} />
          <DirectionPanel {...common} block={down} flip />
        </div>
      </div>

      <div className="mock-page__controls">
        <p className="mock-page__hint">
          시나리오를 조합해 화면 상태를 봅니다 (API 호출 없음, <code>?mock</code>을 빼면 실제 화면).{' '}
          <strong>① 한 대의 흐름</strong>은 위→아래로 하나씩 켜보면 진입·정차·출발·이동·도착이 순서대로
          보입니다. <b>단독</b>을 누르면 그 시나리오만 켜집니다.
        </p>

        <div className="mock-page__scenarios">
          {groups.map(([group, scenarios]) => (
            <fieldset key={group} className="mock-page__group">
              <legend>{group}</legend>
              {scenarios.map((s) => (
                <div key={s.id} className="mock-page__option">
                  <label className="mock-page__option-label">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                    />
                    {s.label}
                  </label>
                  <button
                    type="button"
                    className="mock-page__solo"
                    onClick={() => setSelected(new Set([s.id]))}
                  >
                    단독
                  </button>
                </div>
              ))}
            </fieldset>
          ))}
        </div>

        <button type="button" className="mock-page__clear" onClick={() => setSelected(new Set())}>
          모두 해제
        </button>
      </div>
    </main>
  );
}
