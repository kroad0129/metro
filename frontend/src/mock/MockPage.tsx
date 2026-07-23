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
 * 매번 API를 불러가며 상황이 오길 기다리는 대신, 정차·진입·출발·지연·겹침·심야까지
 * 체크박스로 켜고 끈다. 시간은 페이지를 연 시각 기준으로 실제처럼 흐른다.
 */
export function MockPage() {
  const [baseMs] = useState(() => Date.now());
  const [selected, setSelected] = useState<Set<string>>(() => new Set(DEFAULT_IDS));
  const nowMs = useNow();

  const { up, down } = useMemo(
    () => combineScenarios([...selected], baseMs),
    [selected, baseMs],
  );

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

  return (
    <main className="app mock-page">
      <header className="mock-page__header">
        <h1 className="mock-page__title">목업 모드 — {MOCK_SELECTED.name}역</h1>
        <p className="mock-page__hint">
          가짜 데이터로 화면 상태를 조합합니다. API 호출 없음 — 실제 화면은 주소에서{' '}
          <code>?mock</code>을 빼면 됩니다.
        </p>
        <button type="button" className="mock-page__clear" onClick={() => setSelected(new Set())}>
          모두 해제
        </button>
      </header>

      <div className="mock-page__scenarios">
        {groups.map(([group, scenarios]) => (
          <fieldset key={group} className="mock-page__group">
            <legend>{group}</legend>
            {scenarios.map((s) => (
              <label key={s.id} className="mock-page__option">
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                />
                {s.label}
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      <div className="app__directions">
        <DirectionPanel stations={MOCK_STATIONS} selected={MOCK_SELECTED} block={up} nowMs={nowMs} />
        <DirectionPanel stations={MOCK_STATIONS} selected={MOCK_SELECTED} block={down} nowMs={nowMs} />
      </div>
    </main>
  );
}
