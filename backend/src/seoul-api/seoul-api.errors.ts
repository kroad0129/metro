export class UpstreamUnavailableError extends Error {
  constructor(message = '실시간 지하철 정보를 가져오지 못했습니다.') {
    super(message);
    this.name = 'UpstreamUnavailableError';
  }
}

export class UpstreamRateLimitedError extends Error {
  constructor(message = '실시간 지하철 정보 호출 한도를 초과했습니다.') {
    super(message);
    this.name = 'UpstreamRateLimitedError';
  }
}
