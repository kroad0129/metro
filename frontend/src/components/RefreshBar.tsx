import { formatRelativeTime } from '../utils/relativeTime';

type Props = {
  updatedAt: string | null;
  loading: boolean;
  canRefresh: boolean;
  onRefresh: () => void;
  /** 화면 전용 틱(useNow) — "N초 전 갱신" 문구가 흐르는 시간에 맞춰 다시 계산되게 한다. */
  nowMs: number;
  /** 자동 갱신(폴링) 켜짐 여부. */
  autoRefresh: boolean;
  onToggleAuto: (value: boolean) => void;
};

export function RefreshBar({
  updatedAt,
  loading,
  canRefresh,
  onRefresh,
  nowMs,
  autoRefresh,
  onToggleAuto,
}: Props) {
  return (
    <footer className="refresh-bar">
      <span className="refresh-bar__time">
        {updatedAt ? `${formatRelativeTime(updatedAt, nowMs)} 갱신` : '아직 조회 전'}
      </span>
      <label className="refresh-bar__auto">
        <input
          type="checkbox"
          checked={autoRefresh}
          onChange={(event) => onToggleAuto(event.target.checked)}
        />
        자동 갱신
      </label>
      <button type="button" onClick={onRefresh} disabled={loading || !canRefresh}>
        새로고침
      </button>
    </footer>
  );
}
