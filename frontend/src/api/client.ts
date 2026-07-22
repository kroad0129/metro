export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function requestJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new ApiError('NETWORK_ERROR', '서버에 연결하지 못했습니다.');
  }

  if (!response.ok) {
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      throw new ApiError(
        body.error?.code ?? 'UNKNOWN',
        body.error?.message ?? '요청을 처리하지 못했습니다.',
      );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('UNKNOWN', '요청을 처리하지 못했습니다.');
    }
  }

  return (await response.json()) as T;
}
