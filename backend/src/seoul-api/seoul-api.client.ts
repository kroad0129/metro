import { Logger } from '@nestjs/common';
import axios from 'axios';
import { AppConfig } from '../config/configuration';
import { RawTrain } from '../trains/types';
import { UpstreamRateLimitedError, UpstreamUnavailableError } from './seoul-api.errors';
import { mapArrivalResponse } from './seoul-api.mapper';
import { SeoulArrivalResponse } from './seoul-api.types';

export type HttpGet = (url: string) => Promise<SeoulArrivalResponse>;

/**
 * 서울 열린데이터광장 공식 스펙에 문서화된 코드: INFO-000(정상), INFO-200(데이터 없음),
 * INFO-100(인증키 오류), ERROR-300/301/310/331/332/333/334/335/336, ERROR-500/600/601.
 * 일일 호출 한도 초과 전용 코드는 스펙에 문서화되어 있지 않다. ERROR-337은 실사용 사례에서
 * 흔히 보고되는 값이라 별도 처리에 남겨두지만, 검증되지 않았다는 점에 유의해야 한다.
 * INFO-000/INFO-200을 제외한 모든 코드(미확인 코드 포함)는 아래에서 결국
 * UpstreamUnavailableError로 귀결된다.
 */
const RATE_LIMIT_CODES = ['ERROR-337'];
const NO_DATA_CODES = ['INFO-200'];
const OK_CODES = ['INFO-000'];
const INVALID_KEY_CODES = ['INFO-100'];

const defaultHttpGet: HttpGet = async (url) => {
  const response = await axios.get<SeoulArrivalResponse>(url, { timeout: 5000 });
  return response.data;
};

export class SeoulApiClient {
  private readonly logger = new Logger(SeoulApiClient.name);
  private callCount = 0;

  constructor(
    private readonly config: AppConfig,
    private readonly httpGet: HttpGet = defaultHttpGet,
  ) {}

  getCallCount(): number {
    return this.callCount;
  }

  async fetchStationArrivals(stationName: string, expectedLineId: string): Promise<RawTrain[]> {
    const url =
      `${this.config.seoulBaseUrl}/${this.config.seoulApiKey}` +
      `/json/realtimeStationArrival/0/20/${encodeURIComponent(stationName)}`;

    this.callCount += 1;
    this.logger.log(`서울시 API 호출 #${this.callCount} (${stationName})`);

    let body: SeoulArrivalResponse;
    try {
      body = await this.httpGet(url);
    } catch (error) {
      this.logger.warn(`서울시 API 호출 실패: ${String(error)}`);
      throw new UpstreamUnavailableError();
    }

    const code = body.errorMessage?.code;
    if (code && RATE_LIMIT_CODES.includes(code)) {
      this.logger.warn(`호출 제한 초과 (누적 ${this.callCount}회)`);
      throw new UpstreamRateLimitedError();
    }
    if (code && NO_DATA_CODES.includes(code)) {
      return [];
    }
    if (code && INVALID_KEY_CODES.includes(code)) {
      this.logger.warn(`서울시 API 인증키가 유효하지 않습니다: ${body.errorMessage?.message ?? ''}`);
      throw new UpstreamUnavailableError();
    }
    if (code && !OK_CODES.includes(code)) {
      this.logger.warn(`알 수 없는 응답 코드: ${code} ${body.errorMessage?.message ?? ''}`);
      throw new UpstreamUnavailableError();
    }

    return mapArrivalResponse(body, expectedLineId);
  }
}
