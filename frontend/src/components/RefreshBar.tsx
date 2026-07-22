import { formatRelativeTime } from '../utils/relativeTime';

type Props = {
  updatedAt: string | null;
  loading: boolean;
  canRefresh: boolean;
  onRefresh: () => void;
};

export function RefreshBar({ updatedAt, loading, canRefresh, onRefresh }: Props) {
  return (
    <footer className="refresh-bar">
      <span className="refresh-bar__time">
        {updatedAt ? `${formatRelativeTime(updatedAt)} 갱신` : '아직 조회 전'}
      </span>
      <button type="button" onClick={onRefresh} disabled={loading || !canRefresh}>
        새로고침
      </button>
    </footer>
  );
}
