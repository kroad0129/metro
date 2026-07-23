import { Logger } from '@nestjs/common';
import axios from 'axios';
import { AppConfig } from '../config/configuration';
import { RawTrain } from '../trains/types';
import {
  UpstreamRateLimitedError,
  UpstreamUnavailableError,
} from './seoul-api.errors';
import { mapArrivalResponse } from './seoul-api.mapper';
import { SeoulArrivalResponse } from './seoul-api.types';

export type HttpGet = (url: string) => Promise<unknown>;

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
  const response = await axios.get<unknown>(url, {
    timeout: 5000,
  });
  return response.data;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 성공 응답은 errorMessage로 감싼 구조("wrapped": { errorMessage: { code, message } }),
 * 실패 응답(INFO-100, INFO-200, 기타 ERROR-*)은 최상위에 code/message가 그대로 오는
 * 평평한 구조("flat": { code, message })다. 실제 API로 검증됨(버그 리포트 참고).
 * 두 구조 모두에서 code를 읽는다.
 */
function codeOf(body: Record<string, unknown>): string | undefined {
  const wrapped = body.errorMessage;
  if (isRecord(wrapped) && typeof wrapped.code === 'string')
    return wrapped.code;
  return typeof body.code === 'string' ? body.code : undefined;
}

function messageOf(body: Record<string, unknown>): string {
  const wrapped = body.errorMessage;
  if (isRecord(wrapped) && typeof wrapped.message === 'string')
    return wrapped.message;
  return typeof body.message === 'string' ? body.message : '';
}

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

  async fetchStationArrivals(
    stationName: string,
    expectedLineId: string,
  ): Promise<RawTrain[]> {
    const url =
      `${this.config.seoulBaseUrl}/${this.config.seoulApiKey}` +
      `/json/realtimeStationArrival/0/20/${encodeURIComponent(stationName)}`;

    this.callCount += 1;
    this.logger.log(`서울시 API 호출 #${this.callCount} (${stationName})`);

    let body: SeoulArrivalResponse;
    try {
      body = (await this.httpGet(url)) as SeoulArrivalResponse;
    } catch (error) {
      this.logger.warn(`서울시 API 호출 실패: ${String(error)}`);
      throw new UpstreamUnavailableError();
    }

    if (!isRecord(body)) {
      this.logger.warn(
        '서울시 API 응답 본문을 해석할 수 없습니다 (객체가 아님)',
      );
      throw new UpstreamUnavailableError();
    }

    const code = codeOf(body);
    const hasList = Array.isArray(body.realtimeArrivalList);
    if (!code && !hasList) {
      this.logger.warn(
        '서울시 API 응답에 인식 가능한 코드도 열차 목록도 없습니다',
      );
      throw new UpstreamUnavailableError();
    }

    if (code && RATE_LIMIT_CODES.includes(code)) {
      this.logger.warn(`호출 제한 초과 (누적 ${this.callCount}회)`);
      throw new UpstreamRateLimitedError();
    }
    if (code && NO_DATA_CODES.includes(code)) {
      return [];
    }
    if (code && INVALID_KEY_CODES.includes(code)) {
      this.logger.warn(
        `서울시 API 인증키가 유효하지 않습니다: ${messageOf(body)}`,
      );
      throw new UpstreamUnavailableError();
    }
    if (code && !OK_CODES.includes(code)) {
      this.logger.warn(`알 수 없는 응답 코드: ${code} ${messageOf(body)}`);
      throw new UpstreamUnavailableError();
    }

    return mapArrivalResponse(body, expectedLineId);
  }

  /**
   * 역별 시간표(SearchSTNTimeTableByIDService) 원본 행들을 가져온다.
   * 실시간 API와 호스트가 다르고(열린데이터광장 일반 API), 봉투 구조도 다르다:
   * 성공 { SearchSTNTimeTableByIDService: { RESULT: { CODE }, row: [...] } },
   * 실패 { RESULT: { CODE, MESSAGE } } (최상위 평면) — 둘 다 처리한다.
   *
   * @param stationCd 시간표용 역 코드(9호선은 4100 + 역 순번, 실측 검증됨)
   * @param weekTag 1 평일 / 2 토요일 / 3 휴일(일요일)
   * @param inoutTag 1 / 2 — 방향 축. 의미가 노선마다 달라 신뢰하지 않고, 행의 종착역
   *   코드로 방향을 판정한다(mapTimetableRows). 두 값 모두 호출해 합쳐야 전체가 된다.
   */
  async fetchStationTimetable(
    stationCd: string,
    weekTag: '1' | '2' | '3',
    inoutTag: '1' | '2',
  ): Promise<unknown[]> {
    const url =
      `${this.config.seoulTimetableBaseUrl}/${this.config.seoulApiKey}` +
      `/json/SearchSTNTimeTableByIDService/1/500/${stationCd}/${weekTag}/${inoutTag}`;

    this.callCount += 1;
    this.logger.log(`서울시 시간표 호출 #${this.callCount} (역 ${stationCd}, 주 ${weekTag}, 축 ${inoutTag})`);

    let body: unknown;
    try {
      body = await this.httpGet(url);
    } catch (error) {
      this.logger.warn(`서울시 시간표 호출 실패: ${String(error)}`);
      throw new UpstreamUnavailableError();
    }

    if (!isRecord(body)) throw new UpstreamUnavailableError();

    const wrapper = body.SearchSTNTimeTableByIDService;
    const result = isRecord(wrapper) ? wrapper.RESULT : body.RESULT;
    const code = isRecord(result) && typeof result.CODE === 'string' ? result.CODE : undefined;
    const rows = isRecord(wrapper) && Array.isArray(wrapper.row) ? wrapper.row : undefined;

    if (code && NO_DATA_CODES.includes(code)) return [];
    if (code && RATE_LIMIT_CODES.includes(code)) throw new UpstreamRateLimitedError();
    if (code && !OK_CODES.includes(code)) {
      this.logger.warn(`시간표 응답 코드: ${code}`);
      throw new UpstreamUnavailableError();
    }
    if (!rows) {
      this.logger.warn('시간표 응답에 행 목록이 없습니다');
      throw new UpstreamUnavailableError();
    }
    return rows;
  }
}
