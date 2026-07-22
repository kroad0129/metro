export class LineNotFoundError extends Error {
  constructor(lineId: string) {
    super(`지원하지 않는 노선입니다: ${lineId}`);
    this.name = 'LineNotFoundError';
  }
}

export class StationNotFoundError extends Error {
  constructor(stationId: string) {
    super(`지원하지 않는 역입니다: ${stationId}`);
    this.name = 'StationNotFoundError';
  }
}
