import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CacheService } from '../src/common/cache.service';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { LinesModule } from '../src/lines/lines.module';
import { SeoulApiClient } from '../src/seoul-api/seoul-api.client';
import {
  UpstreamRateLimitedError,
  UpstreamUnavailableError,
} from '../src/seoul-api/seoul-api.errors';
import { TimetableService } from '../src/trains/timetable.service';
import { TrainsController } from '../src/trains/trains.controller';
import { TrainsService } from '../src/trains/trains.service';
import { RawTrain } from '../src/trains/types';

const 증미 = '1009000908';

async function createApp(
  fetchImpl: () => Promise<RawTrain[]>,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [LinesModule],
    controllers: [TrainsController],
    providers: [
      TrainsService,
      {
        provide: CacheService,
        useFactory: () => new CacheService(10_000, 300_000),
      },
      {
        provide: SeoulApiClient,
        useValue: { fetchStationArrivals: jest.fn(fetchImpl) },
      },
      {
        // e2e에서는 시간표를 조회하지 않는다 — 열차가 없는 방향은 nextSchedule: null.
        provide: TimetableService,
        useValue: { nextDeparture: jest.fn(async () => null) },
      },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.init();
  return app;
}

describe('GET /api/lines/:lineId/stations/:stationId/trains', () => {
  let app: INestApplication;
  afterEach(async () => app?.close());

  it('정상 조회 시 방향 두 개와 열차를 반환한다', async () => {
    app = await createApp(async () => [
      {
        trainId: '9134',
        trainType: 'LOCAL',
        currentStationName: '등촌',
        remainingSeconds: 125,
        status: 'DEPARTED',
        directionId: 'UP',
        stationsAway: 1,
        recptnAt: '2026-07-23T13:57:02+09:00',
      },
    ]);

    const res = await request(app.getHttpServer())
      .get(`/api/lines/9/stations/${증미}/trains`)
      .expect(200);

    expect(res.body.station.name).toBe('증미');
    expect(res.body.directions).toHaveLength(2);
    expect(res.body.directions[0].trains[0]).toMatchObject({
      trainId: '9134',
      trainType: 'LOCAL',
      remainingSeconds: 125,
      positionRatio: 0.25,
    });
    expect(res.body.stale).toBe(false);
    expect(typeof res.body.updatedAt).toBe('string');
  });

  it('없는 역은 404 STATION_NOT_FOUND', async () => {
    app = await createApp(async () => []);
    const res = await request(app.getHttpServer())
      .get('/api/lines/9/stations/1009000999/trains')
      .expect(404);
    expect(res.body.error.code).toBe('STATION_NOT_FOUND');
  });

  it('없는 노선은 404 LINE_NOT_FOUND', async () => {
    app = await createApp(async () => []);
    const res = await request(app.getHttpServer())
      .get(`/api/lines/2/stations/${증미}/trains`)
      .expect(404);
    expect(res.body.error.code).toBe('LINE_NOT_FOUND');
  });

  it('호출 제한 초과이고 stale도 없으면 503', async () => {
    app = await createApp(async () => {
      throw new UpstreamRateLimitedError();
    });
    const res = await request(app.getHttpServer())
      .get(`/api/lines/9/stations/${증미}/trains`)
      .expect(503);
    expect(res.body.error.code).toBe('UPSTREAM_RATE_LIMITED');
  });

  it('상류 오류(예: 평평한 구조의 오류 응답)이고 stale도 없으면 502 UPSTREAM_UNAVAILABLE', async () => {
    app = await createApp(async () => {
      throw new UpstreamUnavailableError();
    });
    const res = await request(app.getHttpServer())
      .get(`/api/lines/9/stations/${증미}/trains`)
      .expect(502);
    expect(res.body.error.code).toBe('UPSTREAM_UNAVAILABLE');
  });
});
