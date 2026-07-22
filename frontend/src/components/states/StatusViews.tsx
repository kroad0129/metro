import type { ApiError } from '../../api/client';
import { formatRelativeTime } from '../../utils/relativeTime';

export function LoadingView() {
  return <p className="status status--loading">불러오는 중…</p>;
}

export function ErrorView({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div className="status status--error">
      <p>{error.message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  );
}

export function StaleBanner({ updatedAt }: { updatedAt: string }) {
  return (
    <p className="status status--stale">
      갱신 실패 · {formatRelativeTime(updatedAt)} 데이터
    </p>
  );
}
