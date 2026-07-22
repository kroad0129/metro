# 지하철 실시간 위치 시각화 MVP 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선택한 9호선 역으로 다가오는 양방향 열차의 위치와 도착 예정 시간을 단순한 선 UI로 보여주는 웹 서비스를 로컬 구동 + Docker 구성까지 완성한다.

**Architecture:** nginx가 React 정적 파일을 제공하고 `/api`를 NestJS로 프록시한다. NestJS는 서울시 역 도착정보 API를 호출해 내부 도메인 형식으로 변환하고 10초 TTL 인메모리 캐시로 감싼다. 외부 응답 변환과 위치 계산은 순수 함수로 격리해 API 키 없이 테스트한다.

**Tech Stack:** NestJS 10 / React 18 + Vite 5 / TypeScript 5 / Jest (백엔드) / Vitest + Testing Library (프론트엔드) / Docker Compose / nginx

**Spec:** `docs/superpowers/specs/2026-07-22-subway-tracker-design.md`

## Global Constraints

- Node 20. TypeScript `strict: true`.
- **서울시 API 키가 없다.** 실제 외부 호출을 하는 테스트를 작성하지 않는다. 모든 외부 응답은 `test/fixtures/`의 픽스처를 쓴다.
- DB·Redis·WebSocket을 쓰지 않는다. 캐시는 NestJS 프로세스 메모리에만 존재한다.
- **자동 폴링을 구현하지 않는다.** 조회 시점은 앱 진입·역 선택·새로고침 버튼 세 가지뿐이다.
- 프론트엔드에 역 이름을 하드코딩하지 않는다. 모든 역 정보는 `GET /api/lines/9/stations`에서 온다.
- API 키는 백엔드 환경변수로만 다루며 프론트엔드 번들에 넣지 않는다. `.env`는 커밋하지 않는다.
- UI 문자열은 한국어.
- `directionId`: `UP` = 개화 방면 = `order` 감소 방향. `DOWN` = 중앙보훈병원 방면 = `order` 증가 방향.
- 각 Task 끝에서 커밋한다.

## 공유 타입 계약

여러 Task가 이 타입들을 주고받는다. **Task 1에서 백엔드에, Task 8에서 프론트엔드에 각각 정의**하며 두 정의는 필드명이 동일해야 한다.

```ts
type DirectionId = 'UP' | 'DOWN';
type TrainType   = 'EXPRESS' | 'LOCAL';
type TrainStatus = 'ARRIVED' | 'DEPARTED' | 'TRAVELING' | 'APPROACHING';

type Station = {
  stationId: string;
  name: string;
  order: number;
  isExpressStop: boolean;
};

type Train = {
  trainId: string;
  trainType: TrainType;
  currentStation: Station;
  remainingSeconds: number | null;   // 서울시 API가 0을 주면 null
  status: TrainStatus;
  positionRatio: number;             // 0 | 0.25 | 0.5 | 0.75
};

type DirectionBlock = {
  directionId: DirectionId;
  directionName: string;
  trains: Train[];
};

type TrainsResponse = {
  line: { id: string; name: string };
  station: Station;
  directions: DirectionBlock[];
  updatedAt: string;   // ISO8601
  stale: boolean;
};

type StationsResponse = {
  lineId: string;
  lineName: string;
  stations: Station[];
};
```

`remainingSeconds`가 `null`일 수 있다는 점이 중요하다. 서울시 도착정보 API의 `barvlDt`는 실제로 `"0"`을 자주 반환한다. 이 열차를 버리면 화면이 비어 보이므로, 열차는 남기고 시간만 `null`로 두어 UI에서 `—`로 표시한다.

---

## Task 1: 백엔드 스캐폴딩 + 정적 노선 데이터

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/nest-cli.json`, `backend/jest.config.js`
- Create: `backend/src/main.ts`, `backend/src/app.module.ts`
- Create: `backend/src/lines/types.ts`
- Create: `backend/src/lines/data/line9.json`
- Create: `backend/src/lines/lines.service.ts`, `backend/src/lines/lines.controller.ts`, `backend/src/lines/lines.module.ts`
- Test: `backend/src/lines/lines.service.spec.ts`

**Interfaces:**
- Produces: `LinesService.getLine(lineId: string): Line | null`, `LinesService.getStations(lineId: string): Station[]`, `LinesService.findStationById(lineId, stationId): Station | null`, `LinesService.findStationByName(lineId, name): Station | null`, `LinesService.getStationByOrder(lineId, order): Station | null`
- Produces: 타입 `Station`, `Line`, `DirectionId`
- Produces: `GET /api/lines/:lineId/stations` → `StationsResponse`

- [ ] **Step 1: NestJS 프로젝트 생성**

```bash
cd C:/dev/metro
npx --yes @nestjs/cli@10 new backend --skip-git --package-manager npm
```

프롬프트가 나오면 npm 선택. 완료 후:

```bash
cd backend
npm install
```

- [ ] **Step 2: 기본 설정 조정**

`backend/tsconfig.json`에서 strict 모드를 켠다:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "esModuleInterop": true
  }
}
```

`resolveJsonModule: true`가 있어야 `line9.json`을 import할 수 있다.

`backend/src/main.ts`를 다음으로 교체한다:

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 3: 타입 정의**

`backend/src/lines/types.ts`:

```ts
export type DirectionId = 'UP' | 'DOWN';

export type Station = {
  stationId: string;
  name: string;
  order: number;
  isExpressStop: boolean;
};

export type Line = {
  lineId: string;
  lineName: string;
  stations: Station[];
};
```

- [ ] **Step 4: 9호선 정적 데이터 작성**

`backend/src/lines/data/line9.json`. `stationId`는 서울시 API 확인 전까지 `9-{order}` 형태의 내부 ID를 쓴다 — 프론트엔드는 이 ID만 사용하고 외부 ID를 모르므로, 나중에 실제 ID로 교체해도 프론트엔드는 수정되지 않는다.

`isExpressStop`은 스펙 2절 6번의 검증 대상이다. 아래는 초안이며 공식 자료로 대조해야 한다.

```json
{
  "lineId": "9",
  "lineName": "서울 지하철 9호선",
  "stations": [
    { "stationId": "9-1",  "name": "개화",       "order": 1,  "isExpressStop": false },
    { "stationId": "9-2",  "name": "김포공항",   "order": 2,  "isExpressStop": true  },
    { "stationId": "9-3",  "name": "공항시장",   "order": 3,  "isExpressStop": false },
    { "stationId": "9-4",  "name": "신방화",     "order": 4,  "isExpressStop": false },
    { "stationId": "9-5",  "name": "마곡나루",   "order": 5,  "isExpressStop": true  },
    { "stationId": "9-6",  "name": "양천향교",   "order": 6,  "isExpressStop": false },
    { "stationId": "9-7",  "name": "가양",       "order": 7,  "isExpressStop": true  },
    { "stationId": "9-8",  "name": "증미",       "order": 8,  "isExpressStop": false },
    { "stationId": "9-9",  "name": "등촌",       "order": 9,  "isExpressStop": false },
    { "stationId": "9-10", "name": "염창",       "order": 10, "isExpressStop": true  },
    { "stationId": "9-11", "name": "신목동",     "order": 11, "isExpressStop": false },
    { "stationId": "9-12", "name": "선유도",     "order": 12, "isExpressStop": false },
    { "stationId": "9-13", "name": "당산",       "order": 13, "isExpressStop": true  },
    { "stationId": "9-14", "name": "국회의사당", "order": 14, "isExpressStop": false },
    { "stationId": "9-15", "name": "여의도",     "order": 15, "isExpressStop": true  },
    { "stationId": "9-16", "name": "샛강",       "order": 16, "isExpressStop": false },
    { "stationId": "9-17", "name": "노량진",     "order": 17, "isExpressStop": true  },
    { "stationId": "9-18", "name": "노들",       "order": 18, "isExpressStop": false },
    { "stationId": "9-19", "name": "흑석",       "order": 19, "isExpressStop": false },
    { "stationId": "9-20", "name": "동작",       "order": 20, "isExpressStop": true  },
    { "stationId": "9-21", "name": "구반포",     "order": 21, "isExpressStop": false },
    { "stationId": "9-22", "name": "신반포",     "order": 22, "isExpressStop": false },
    { "stationId": "9-23", "name": "고속터미널", "order": 23, "isExpressStop": true  },
    { "stationId": "9-24", "name": "사평",       "order": 24, "isExpressStop": false },
    { "stationId": "9-25", "name": "신논현",     "order": 25, "isExpressStop": true  },
    { "stationId": "9-26", "name": "언주",       "order": 26, "isExpressStop": false },
    { "stationId": "9-27", "name": "선정릉",     "order": 27, "isExpressStop": true  },
    { "stationId": "9-28", "name": "삼성중앙",   "order": 28, "isExpressStop": false },
    { "stationId": "9-29", "name": "봉은사",     "order": 29, "isExpressStop": true  },
    { "stationId": "9-30", "name": "종합운동장", "order": 30, "isExpressStop": true  },
    { "stationId": "9-31", "name": "삼전",       "order": 31, "isExpressStop": false },
    { "stationId": "9-32", "name": "석촌고분",   "order": 32, "isExpressStop": false },
    { "stationId": "9-33", "name": "석촌",       "order": 33, "isExpressStop": true  },
    { "stationId": "9-34", "name": "송파나루",   "order": 34, "isExpressStop": false },
    { "stationId": "9-35", "name": "한성백제",   "order": 35, "isExpressStop": false },
    { "stationId": "9-36", "name": "올림픽공원", "order": 36, "isExpressStop": true  },
    { "stationId": "9-37", "name": "둔촌오륜",   "order": 37, "isExpressStop": false },
    { "stationId": "9-38", "name": "중앙보훈병원","order": 38, "isExpressStop": true  }
  ]
}
```

- [ ] **Step 5: LinesService 실패 테스트 작성**

`backend/src/lines/lines.service.spec.ts`:

```ts
import { LinesService } from './lines.service';

describe('LinesService', () => {
  let service: LinesService;

  beforeEach(() => {
    service = new LinesService();
  });

  it('9호선 역 38개를 order 순서대로 반환한다', () => {
    const stations = service.getStations('9');
    expect(stations).toHaveLength(38);
    expect(stations[0].name).toBe('개화');
    expect(stations[0].order).toBe(1);
    expect(stations[37].name).toBe('중앙보훈병원');
    expect(stations[37].order).toBe(38);
  });

  it('지원하지 않는 노선은 빈 배열을 반환한다', () => {
    expect(service.getStations('2')).toEqual([]);
    expect(service.getLine('2')).toBeNull();
  });

  it('stationId로 역을 찾는다', () => {
    const station = service.findStationById('9', '9-8');
    expect(station?.name).toBe('증미');
    expect(station?.order).toBe(8);
  });

  it('없는 stationId는 null을 반환한다', () => {
    expect(service.findStationById('9', '9-999')).toBeNull();
  });

  it('역 이름으로 역을 찾는다', () => {
    expect(service.findStationByName('9', '등촌')?.order).toBe(9);
  });

  it('역 이름의 앞뒤 공백과 "역" 접미사를 무시하고 찾는다', () => {
    expect(service.findStationByName('9', ' 등촌역 ')?.order).toBe(9);
  });

  it('없는 역 이름은 null을 반환한다', () => {
    expect(service.findStationByName('9', '강남')).toBeNull();
  });

  it('order로 역을 찾는다', () => {
    expect(service.getStationByOrder('9', 10)?.name).toBe('염창');
    expect(service.getStationByOrder('9', 0)).toBeNull();
    expect(service.getStationByOrder('9', 39)).toBeNull();
  });

  it('증미역은 급행 미정차역이다', () => {
    expect(service.findStationById('9', '9-8')?.isExpressStop).toBe(false);
  });

  it('김포공항역은 급행 정차역이다', () => {
    expect(service.findStationById('9', '9-2')?.isExpressStop).toBe(true);
  });
});
```

역명 정규화 테스트가 있는 이유: 서울시 API가 역명을 `"등촌"`으로 줄지 `"등촌역"`으로 줄지 확인되지 않았다(스펙 2절 2번). 양쪽 모두 매칭되게 해 두면 그 불확실성이 사라진다.

- [ ] **Step 6: 테스트 실패 확인**

```bash
cd backend && npx jest src/lines/lines.service.spec.ts
```

Expected: FAIL — `Cannot find module './lines.service'`

- [ ] **Step 7: LinesService 구현**

`backend/src/lines/lines.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Line, Station } from './types';
import line9 from './data/line9.json';

const LINES: Line[] = [line9 as Line];

function normalizeName(name: string): string {
  return name.trim().replace(/역$/, '');
}

@Injectable()
export class LinesService {
  private readonly byId = new Map<string, Line>();

  constructor() {
    for (const line of LINES) {
      this.byId.set(line.lineId, line);
    }
  }

  getLine(lineId: string): Line | null {
    return this.byId.get(lineId) ?? null;
  }

  getStations(lineId: string): Station[] {
    return this.getLine(lineId)?.stations ?? [];
  }

  findStationById(lineId: string, stationId: string): Station | null {
    return this.getStations(lineId).find((s) => s.stationId === stationId) ?? null;
  }

  findStationByName(lineId: string, name: string): Station | null {
    const target = normalizeName(name);
    return this.getStations(lineId).find((s) => normalizeName(s.name) === target) ?? null;
  }

  getStationByOrder(lineId: string, order: number): Station | null {
    return this.getStations(lineId).find((s) => s.order === order) ?? null;
  }
}
```

- [ ] **Step 8: 테스트 통과 확인**

```bash
cd backend && npx jest src/lines/lines.service.spec.ts
```

Expected: PASS — 10 tests

- [ ] **Step 9: 컨트롤러와 모듈 작성**

`backend/src/lines/lines.controller.ts`:

```ts
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { LinesService } from './lines.service';

@Controller('lines')
export class LinesController {
  constructor(private readonly lines: LinesService) {}

  @Get(':lineId/stations')
  getStations(@Param('lineId') lineId: string) {
    const line = this.lines.getLine(lineId);
    if (!line) {
      throw new NotFoundException({
        error: { code: 'LINE_NOT_FOUND', message: `지원하지 않는 노선입니다: ${lineId}` },
      });
    }
    return { lineId: line.lineId, lineName: line.lineName, stations: line.stations };
  }
}
```

`backend/src/lines/lines.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { LinesController } from './lines.controller';
import { LinesService } from './lines.service';

@Module({
  controllers: [LinesController],
  providers: [LinesService],
  exports: [LinesService],
})
export class LinesModule {}
```

`backend/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { LinesModule } from './lines/lines.module';

@Module({ imports: [LinesModule] })
export class AppModule {}
```

- [ ] **Step 10: 수동 확인**

```bash
cd backend && npm run start:dev
```

다른 터미널에서:

```bash
curl http://localhost:3000/api/lines/9/stations
curl -i http://localhost:3000/api/lines/2/stations
```

Expected: 첫 번째는 38개 역 JSON, 두 번째는 404 + `LINE_NOT_FOUND`. 확인 후 서버를 종료한다.

- [ ] **Step 11: 커밋**

```bash
cd C:/dev/metro
git add backend
git commit -m "feat(backend): 9호선 정적 노선 데이터와 역 목록 API"
```

---

## Task 2: 열차 위치 계산 (순수 함수)

**Files:**
- Create: `backend/src/trains/types.ts`
- Create: `backend/src/trains/train-position.ts`
- Test: `backend/src/trains/train-position.spec.ts`

**Interfaces:**
- Consumes: Task 1의 `Station`, `DirectionId`
- Produces: 타입 `TrainStatus`, `TrainType`, `Train`, `DirectionBlock`, `TrainsResponse`
- Produces: `positionRatioOf(status: TrainStatus): number`

- [ ] **Step 1: 타입 정의**

`backend/src/trains/types.ts`:

```ts
import { DirectionId, Station } from '../lines/types';

export type TrainType = 'EXPRESS' | 'LOCAL';
export type TrainStatus = 'ARRIVED' | 'DEPARTED' | 'TRAVELING' | 'APPROACHING';

/** 외부 응답을 변환한 직후 상태. 현재 위치가 아직 역 "이름" 문자열이다. */
export type RawTrain = {
  trainId: string;
  trainType: TrainType;
  currentStationName: string;
  remainingSeconds: number | null;
  status: TrainStatus;
  directionId: DirectionId;
};

/** 역 매칭까지 끝난 최종 형태. */
export type Train = {
  trainId: string;
  trainType: TrainType;
  currentStation: Station;
  remainingSeconds: number | null;
  status: TrainStatus;
  positionRatio: number;
};

export type DirectionBlock = {
  directionId: DirectionId;
  directionName: string;
  trains: Train[];
};

export type TrainsResponse = {
  line: { id: string; name: string };
  station: Station;
  directions: DirectionBlock[];
  updatedAt: string;
  stale: boolean;
};
```

- [ ] **Step 2: 실패 테스트 작성**

`backend/src/trains/train-position.spec.ts`:

```ts
import { positionRatioOf } from './train-position';

describe('positionRatioOf', () => {
  it('역에 도착한 열차는 0', () => {
    expect(positionRatioOf('ARRIVED')).toBe(0);
  });

  it('역을 출발한 열차는 0.25', () => {
    expect(positionRatioOf('DEPARTED')).toBe(0.25);
  });

  it('역 사이를 이동 중인 열차는 0.5', () => {
    expect(positionRatioOf('TRAVELING')).toBe(0.5);
  });

  it('다음 역에 진입 중인 열차는 0.75', () => {
    expect(positionRatioOf('APPROACHING')).toBe(0.75);
  });

  it('모든 값은 0 이상 1 미만이다', () => {
    const all = (['ARRIVED', 'DEPARTED', 'TRAVELING', 'APPROACHING'] as const).map(positionRatioOf);
    for (const ratio of all) {
      expect(ratio).toBeGreaterThanOrEqual(0);
      expect(ratio).toBeLessThan(1);
    }
  });
});
```

`1 미만`인 이유: `positionRatio`가 1이면 현재 역이 아니라 다음 역에 있다는 뜻이 되어 `currentStation`과 모순된다.

- [ ] **Step 3: 테스트 실패 확인**

```bash
cd backend && npx jest src/trains/train-position.spec.ts
```

Expected: FAIL — `Cannot find module './train-position'`

- [ ] **Step 4: 구현**

`backend/src/trains/train-position.ts`:

```ts
import { TrainStatus } from './types';

/**
 * currentStation을 기준으로 진행 방향(선택한 역 쪽)으로 얼마나 갔는지를 0~1 미만으로 나타낸다.
 * 스펙 6.4절 표를 그대로 구현한 것이다.
 *
 * 주의: APPROACHING은 "currentStation을 지나 다음 역에 접근 중"으로 해석한다.
 * 서울시 API의 진입 코드가 실제로 어느 역 기준인지는 확인되지 않았다(스펙 2절 2번).
 * 사용자가 실제로 보고 판단하는 값은 remainingSeconds이므로, 한 구간 이내의
 * 위치 오차는 MVP에서 허용한다.
 */
const RATIO: Record<TrainStatus, number> = {
  ARRIVED: 0,
  DEPARTED: 0.25,
  TRAVELING: 0.5,
  APPROACHING: 0.75,
};

export function positionRatioOf(status: TrainStatus): number {
  return RATIO[status];
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd backend && npx jest src/trains/train-position.spec.ts
```

Expected: PASS — 5 tests

- [ ] **Step 6: 커밋**

```bash
git add backend/src/trains
git commit -m "feat(backend): 열차 상태별 위치 비율 계산"
```

---

## Task 3: 서울시 API 응답 변환 (순수 함수)

**Files:**
- Create: `backend/test/fixtures/station-arrival.success.json`
- Create: `backend/test/fixtures/station-arrival.empty.json`
- Create: `backend/src/seoul-api/seoul-api.types.ts`
- Create: `backend/src/seoul-api/seoul-api.mapper.ts`
- Test: `backend/src/seoul-api/seoul-api.mapper.spec.ts`

**Interfaces:**
- Consumes: Task 2의 `RawTrain`, `TrainStatus`, `TrainType`
- Produces: `mapArrivalResponse(raw: SeoulArrivalResponse): RawTrain[]`
- Produces: 타입 `SeoulArrivalResponse`, `SeoulArrivalItem`

**이 Task가 스펙 2절 "검증 필요 항목"의 대부분을 담고 있다.** 픽스처는 서울시 공식 문서의 응답 예시를 기준으로 작성한 추정치이며, 키 발급 후 실제 응답으로 교체한다. 그때 깨지는 테스트가 잘못 추측한 지점의 목록이 된다.

- [ ] **Step 1: 픽스처 작성**

`backend/test/fixtures/station-arrival.success.json` — 증미역 조회 결과 가정. 급행 1대, 일반 3대, `barvlDt`가 `"0"`인 열차 1대를 포함한다.

```json
{
  "errorMessage": { "status": 200, "code": "INFO-000", "message": "정상 처리되었습니다.", "total": 4 },
  "realtimeArrivalList": [
    {
      "subwayId": "1009", "updnLine": "상행", "trainLineNm": "개화행 - 등촌방면",
      "statnNm": "증미", "btrainSttus": "일반", "btrainNo": "9134",
      "bstatnNm": "개화", "barvlDt": "125", "arvlMsg2": "전역 출발",
      "arvlMsg3": "등촌", "arvlCd": "3"
    },
    {
      "subwayId": "1009", "updnLine": "상행", "trainLineNm": "김포공항행 - 등촌방면",
      "statnNm": "증미", "btrainSttus": "급행", "btrainNo": "9711",
      "bstatnNm": "김포공항", "barvlDt": "300", "arvlMsg2": "3분 후 (염창)",
      "arvlMsg3": "염창", "arvlCd": "99"
    },
    {
      "subwayId": "1009", "updnLine": "하행", "trainLineNm": "중앙보훈병원행 - 가양방면",
      "statnNm": "증미", "btrainSttus": "일반", "btrainNo": "9256",
      "bstatnNm": "중앙보훈병원", "barvlDt": "60", "arvlMsg2": "전역 진입",
      "arvlMsg3": "가양", "arvlCd": "4"
    },
    {
      "subwayId": "1009", "updnLine": "하행", "trainLineNm": "중앙보훈병원행 - 가양방면",
      "statnNm": "증미", "btrainSttus": "일반", "btrainNo": "9260",
      "bstatnNm": "중앙보훈병원", "barvlDt": "0", "arvlMsg2": "출발",
      "arvlMsg3": "마곡나루", "arvlCd": "2"
    }
  ]
}
```

`backend/test/fixtures/station-arrival.empty.json`:

```json
{
  "errorMessage": { "status": 200, "code": "INFO-200", "message": "해당하는 데이터가 없습니다.", "total": 0 },
  "realtimeArrivalList": []
}
```

- [ ] **Step 2: 외부 응답 타입 정의**

`backend/src/seoul-api/seoul-api.types.ts`:

```ts
/** 서울 열린데이터광장 realtimeStationArrival 응답. 필드는 미검증(스펙 2절 1번). */
export type SeoulArrivalItem = {
  subwayId?: string;
  updnLine?: string;      // "상행" | "하행"
  trainLineNm?: string;   // "개화행 - 등촌방면"
  statnNm?: string;       // 조회한 역
  btrainSttus?: string;   // "급행" | "일반" | "특급"
  btrainNo?: string;      // 열차번호
  bstatnNm?: string;      // 종착역
  barvlDt?: string;       // 도착예정 초. "0"이면 미제공
  arvlMsg2?: string;
  arvlMsg3?: string;      // 현재 열차가 있는 역명
  arvlCd?: string;        // 0진입 1도착 2출발 3전역출발 4전역진입 5전역도착 99운행중
};

export type SeoulArrivalResponse = {
  errorMessage?: { status?: number; code?: string; message?: string; total?: number };
  realtimeArrivalList?: SeoulArrivalItem[];
};
```

모든 필드를 optional로 둔 이유: 응답 형태가 확인되지 않았으므로 필드가 없어도 코드가 죽지 않아야 한다.

- [ ] **Step 3: 실패 테스트 작성**

`backend/src/seoul-api/seoul-api.mapper.spec.ts`:

```ts
import { mapArrivalResponse } from './seoul-api.mapper';
import { SeoulArrivalResponse } from './seoul-api.types';
import success from '../../test/fixtures/station-arrival.success.json';
import empty from '../../test/fixtures/station-arrival.empty.json';

describe('mapArrivalResponse', () => {
  it('열차 4대를 모두 변환한다', () => {
    expect(mapArrivalResponse(success as SeoulArrivalResponse)).toHaveLength(4);
  });

  it('열차번호를 trainId로 옮긴다', () => {
    const [first] = mapArrivalResponse(success as SeoulArrivalResponse);
    expect(first.trainId).toBe('9134');
  });

  it('상행을 UP, 하행을 DOWN으로 매핑한다', () => {
    const trains = mapArrivalResponse(success as SeoulArrivalResponse);
    expect(trains[0].directionId).toBe('UP');
    expect(trains[2].directionId).toBe('DOWN');
  });

  it('급행을 EXPRESS, 일반을 LOCAL로 매핑한다', () => {
    const trains = mapArrivalResponse(success as SeoulArrivalResponse);
    expect(trains[0].trainType).toBe('LOCAL');
    expect(trains[1].trainType).toBe('EXPRESS');
  });

  it('arvlMsg3를 현재 위치 역명으로 옮긴다', () => {
    const trains = mapArrivalResponse(success as SeoulArrivalResponse);
    expect(trains[0].currentStationName).toBe('등촌');
    expect(trains[1].currentStationName).toBe('염창');
  });

  it('barvlDt를 초 단위 숫자로 변환한다', () => {
    expect(mapArrivalResponse(success as SeoulArrivalResponse)[0].remainingSeconds).toBe(125);
  });

  it('barvlDt가 "0"이면 remainingSeconds는 null이다', () => {
    expect(mapArrivalResponse(success as SeoulArrivalResponse)[3].remainingSeconds).toBeNull();
  });

  it('arvlCd를 status로 매핑한다', () => {
    const trains = mapArrivalResponse(success as SeoulArrivalResponse);
    expect(trains[0].status).toBe('DEPARTED');    // 3 전역출발
    expect(trains[1].status).toBe('TRAVELING');   // 99 운행중
    expect(trains[2].status).toBe('APPROACHING'); // 4 전역진입
    expect(trains[3].status).toBe('DEPARTED');    // 2 출발
  });

  it('도착 코드를 ARRIVED로 매핑한다', () => {
    const raw: SeoulArrivalResponse = {
      realtimeArrivalList: [
        { updnLine: '상행', btrainSttus: '일반', btrainNo: '1', barvlDt: '10', arvlMsg3: '등촌', arvlCd: '1' },
        { updnLine: '상행', btrainSttus: '일반', btrainNo: '2', barvlDt: '10', arvlMsg3: '등촌', arvlCd: '5' },
      ],
    };
    expect(mapArrivalResponse(raw).map((t) => t.status)).toEqual(['ARRIVED', 'ARRIVED']);
  });

  it('진입 코드를 APPROACHING으로 매핑한다', () => {
    const raw: SeoulArrivalResponse = {
      realtimeArrivalList: [
        { updnLine: '상행', btrainSttus: '일반', btrainNo: '1', barvlDt: '10', arvlMsg3: '등촌', arvlCd: '0' },
      ],
    };
    expect(mapArrivalResponse(raw)[0].status).toBe('APPROACHING');
  });

  it('빈 응답은 빈 배열을 반환한다', () => {
    expect(mapArrivalResponse(empty as SeoulArrivalResponse)).toEqual([]);
  });

  it('realtimeArrivalList가 아예 없어도 빈 배열을 반환한다', () => {
    expect(mapArrivalResponse({})).toEqual([]);
  });

  it('현재 위치 역명이 없는 항목은 버린다', () => {
    const raw: SeoulArrivalResponse = {
      realtimeArrivalList: [
        { updnLine: '상행', btrainSttus: '일반', btrainNo: '1', barvlDt: '10', arvlCd: '1' },
      ],
    };
    expect(mapArrivalResponse(raw)).toEqual([]);
  });

  it('방향을 알 수 없는 항목은 버린다', () => {
    const raw: SeoulArrivalResponse = {
      realtimeArrivalList: [
        { updnLine: '???', btrainSttus: '일반', btrainNo: '1', barvlDt: '10', arvlMsg3: '등촌', arvlCd: '1' },
      ],
    };
    expect(mapArrivalResponse(raw)).toEqual([]);
  });

  it('알 수 없는 arvlCd는 TRAVELING으로 처리한다', () => {
    const raw: SeoulArrivalResponse = {
      realtimeArrivalList: [
        { updnLine: '상행', btrainSttus: '일반', btrainNo: '1', barvlDt: '10', arvlMsg3: '등촌', arvlCd: '77' },
      ],
    };
    expect(mapArrivalResponse(raw)[0].status).toBe('TRAVELING');
  });

  it('열차번호가 없으면 위치와 방향으로 안정적인 id를 만든다', () => {
    const raw: SeoulArrivalResponse = {
      realtimeArrivalList: [
        { updnLine: '상행', btrainSttus: '일반', barvlDt: '10', arvlMsg3: '등촌', arvlCd: '1' },
      ],
    };
    expect(mapArrivalResponse(raw)[0].trainId).toBe('UP-등촌-0');
  });
});
```

- [ ] **Step 4: 테스트 실패 확인**

```bash
cd backend && npx jest src/seoul-api/seoul-api.mapper.spec.ts
```

Expected: FAIL — `Cannot find module './seoul-api.mapper'`

- [ ] **Step 5: 구현**

`backend/src/seoul-api/seoul-api.mapper.ts`:

```ts
import { DirectionId } from '../lines/types';
import { RawTrain, TrainStatus, TrainType } from '../trains/types';
import { SeoulArrivalItem, SeoulArrivalResponse } from './seoul-api.types';

const STATUS_BY_ARVL_CD: Record<string, TrainStatus> = {
  '0': 'APPROACHING',  // 진입
  '1': 'ARRIVED',      // 도착
  '2': 'DEPARTED',     // 출발
  '3': 'DEPARTED',     // 전역출발
  '4': 'APPROACHING',  // 전역진입
  '5': 'ARRIVED',      // 전역도착
  '99': 'TRAVELING',   // 운행중
};

function toDirection(updnLine: string | undefined): DirectionId | null {
  if (!updnLine) return null;
  if (updnLine.includes('상행')) return 'UP';
  if (updnLine.includes('하행')) return 'DOWN';
  return null;
}

function toTrainType(btrainSttus: string | undefined): TrainType {
  if (!btrainSttus) return 'LOCAL';
  return btrainSttus.includes('급행') || btrainSttus.includes('특급') ? 'EXPRESS' : 'LOCAL';
}

function toRemainingSeconds(barvlDt: string | undefined): number | null {
  const seconds = Number(barvlDt);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return seconds;
}

function mapItem(item: SeoulArrivalItem, index: number): RawTrain | null {
  const directionId = toDirection(item.updnLine);
  const currentStationName = item.arvlMsg3?.trim();
  if (!directionId || !currentStationName) return null;

  return {
    trainId: item.btrainNo?.trim() || `${directionId}-${currentStationName}-${index}`,
    trainType: toTrainType(item.btrainSttus),
    currentStationName,
    remainingSeconds: toRemainingSeconds(item.barvlDt),
    status: STATUS_BY_ARVL_CD[item.arvlCd ?? ''] ?? 'TRAVELING',
    directionId,
  };
}

/** 서울시 도착정보 응답을 내부 도메인 형식으로 변환한다. 해석 불가한 항목은 조용히 버린다. */
export function mapArrivalResponse(raw: SeoulArrivalResponse): RawTrain[] {
  const list = raw.realtimeArrivalList ?? [];
  return list
    .map((item, index) => mapItem(item, index))
    .filter((train): train is RawTrain => train !== null);
}
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
cd backend && npx jest src/seoul-api/seoul-api.mapper.spec.ts
```

Expected: PASS — 16 tests

- [ ] **Step 7: 커밋**

```bash
git add backend/src/seoul-api backend/test/fixtures
git commit -m "feat(backend): 서울시 도착정보 응답 변환 (픽스처 기반)"
```

---

## Task 4: TTL 캐시 + stale 보관

**Files:**
- Create: `backend/src/common/cache.service.ts`
- Create: `backend/src/common/common.module.ts`
- Test: `backend/src/common/cache.service.spec.ts`

**Interfaces:**
- Produces: `CacheService.get<T>(key: string): T | null` (TTL 이내만)
- Produces: `CacheService.getStale<T>(key: string): { value: T; storedAt: number } | null` (staleMaxAge 이내)
- Produces: `CacheService.set<T>(key: string, value: T): void`
- Produces: `CacheService` 생성자 `(ttlMs: number, staleMaxAgeMs: number)`

캐시가 두 종류의 조회를 제공하는 것이 핵심이다. `get`은 신선한 데이터만 주고, `getStale`은 만료됐어도 마지막 성공값을 준다. 스펙 6.2절의 `stale` 플래그가 이 위에 얹힌다.

- [ ] **Step 1: 실패 테스트 작성**

`backend/src/common/cache.service.spec.ts`:

```ts
import { CacheService } from './cache.service';

describe('CacheService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('저장한 값을 TTL 이내에 반환한다', () => {
    const cache = new CacheService(10_000, 300_000);
    cache.set('k', { n: 1 });
    expect(cache.get<{ n: number }>('k')).toEqual({ n: 1 });
  });

  it('없는 키는 null을 반환한다', () => {
    expect(new CacheService(10_000, 300_000).get('missing')).toBeNull();
  });

  it('TTL이 지나면 get은 null을 반환한다', () => {
    const cache = new CacheService(10_000, 300_000);
    cache.set('k', { n: 1 });
    jest.advanceTimersByTime(10_001);
    expect(cache.get('k')).toBeNull();
  });

  it('TTL이 지나도 getStale은 값과 저장 시각을 반환한다', () => {
    const cache = new CacheService(10_000, 300_000);
    cache.set('k', { n: 1 });
    const storedAt = Date.now();
    jest.advanceTimersByTime(10_001);
    const stale = cache.getStale<{ n: number }>('k');
    expect(stale?.value).toEqual({ n: 1 });
    expect(stale?.storedAt).toBe(storedAt);
  });

  it('staleMaxAge를 넘으면 getStale도 null을 반환한다', () => {
    const cache = new CacheService(10_000, 300_000);
    cache.set('k', { n: 1 });
    jest.advanceTimersByTime(300_001);
    expect(cache.getStale('k')).toBeNull();
  });

  it('같은 키에 다시 저장하면 값과 시각이 갱신된다', () => {
    const cache = new CacheService(10_000, 300_000);
    cache.set('k', { n: 1 });
    jest.advanceTimersByTime(10_001);
    cache.set('k', { n: 2 });
    expect(cache.get<{ n: number }>('k')).toEqual({ n: 2 });
  });

  it('키가 다르면 서로 영향을 주지 않는다', () => {
    const cache = new CacheService(10_000, 300_000);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd backend && npx jest src/common/cache.service.spec.ts
```

Expected: FAIL — `Cannot find module './cache.service'`

- [ ] **Step 3: 구현**

`backend/src/common/cache.service.ts`:

```ts
type Entry = { value: unknown; storedAt: number };

/**
 * 인메모리 TTL 캐시. 프로세스 메모리에만 존재하며 재시작 시 사라져도 무방하다.
 *
 * get()은 TTL 이내의 신선한 값만 준다 — 새로고침 연타를 막는 용도.
 * getStale()은 TTL이 지났어도 staleMaxAge 이내면 값을 준다 — 외부 API 실패 시
 * 마지막 정상 데이터를 보여주는 용도(스펙 6.2절).
 */
export class CacheService {
  private readonly store = new Map<string, Entry>();

  constructor(
    private readonly ttlMs: number,
    private readonly staleMaxAgeMs: number,
  ) {}

  set<T>(key: string, value: T): void {
    this.store.set(key, { value, storedAt: Date.now() });
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.storedAt > this.ttlMs) return null;
    return entry.value as T;
  }

  getStale<T>(key: string): { value: T; storedAt: number } | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.storedAt > this.staleMaxAgeMs) {
      this.store.delete(key);
      return null;
    }
    return { value: entry.value as T, storedAt: entry.storedAt };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend && npx jest src/common/cache.service.spec.ts
```

Expected: PASS — 7 tests

- [ ] **Step 5: 커밋**

```bash
git add backend/src/common
git commit -m "feat(backend): TTL 캐시와 stale 데이터 보관"
```

---

## Task 5: 설정 + 서울시 API 클라이언트

**Files:**
- Create: `backend/src/config/configuration.ts`
- Create: `backend/src/seoul-api/seoul-api.errors.ts`
- Create: `backend/src/seoul-api/seoul-api.client.ts`
- Create: `backend/src/seoul-api/seoul-api.module.ts`
- Create: `backend/.env.example`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/seoul-api/seoul-api.client.spec.ts`

**Interfaces:**
- Consumes: Task 3의 `mapArrivalResponse`, `SeoulArrivalResponse`
- Produces: `SeoulApiClient.fetchStationArrivals(stationName: string): Promise<RawTrain[]>`
- Produces: `SeoulApiClient.getCallCount(): number`
- Produces: `UpstreamUnavailableError`, `UpstreamRateLimitedError`
- Produces: `loadConfig(env): AppConfig` — `{ port, seoulApiKey, seoulBaseUrl, cacheTtlMs, staleMaxAgeMs }`

- [ ] **Step 1: 의존성 설치**

```bash
cd backend
npm install @nestjs/config @nestjs/axios axios
```

- [ ] **Step 2: 오류 타입과 설정 실패 테스트 작성**

`backend/src/seoul-api/seoul-api.errors.ts`:

```ts
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
```

`backend/src/config/configuration.ts`:

```ts
export type AppConfig = {
  port: number;
  seoulApiKey: string;
  seoulBaseUrl: string;
  cacheTtlMs: number;
  staleMaxAgeMs: number;
};

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`환경변수 ${key}가 설정되지 않았습니다. .env를 확인하세요.`);
  }
  return value;
}

function numberOr(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const value = Number(env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: numberOr(env, 'PORT', 3000),
    seoulApiKey: required(env, 'SEOUL_OPEN_API_KEY'),
    seoulBaseUrl:
      env.SEOUL_SUBWAY_REALTIME_BASE_URL?.trim() || 'http://swopenapi.seoul.go.kr/api/subway',
    cacheTtlMs: numberOr(env, 'SUBWAY_CACHE_TTL_MS', 10_000),
    staleMaxAgeMs: numberOr(env, 'SUBWAY_STALE_MAX_AGE_MS', 300_000),
  };
}
```

`backend/.env.example`:

```env
NODE_ENV=development
PORT=3000

SEOUL_OPEN_API_KEY=
SEOUL_SUBWAY_REALTIME_BASE_URL=http://swopenapi.seoul.go.kr/api/subway

SUBWAY_CACHE_TTL_MS=10000
SUBWAY_STALE_MAX_AGE_MS=300000

# 수동 새로고침 방식이므로 현재 미사용. 폴링 도입 시 활성화.
# SUBWAY_POLLING_INTERVAL_MS=15000
```

- [ ] **Step 3: 클라이언트 실패 테스트 작성**

`backend/src/seoul-api/seoul-api.client.spec.ts`:

```ts
import { SeoulApiClient } from './seoul-api.client';
import { UpstreamRateLimitedError, UpstreamUnavailableError } from './seoul-api.errors';
import success from '../../test/fixtures/station-arrival.success.json';

const CONFIG = {
  port: 3000,
  seoulApiKey: 'TESTKEY',
  seoulBaseUrl: 'http://example.test/api/subway',
  cacheTtlMs: 10_000,
  staleMaxAgeMs: 300_000,
};

describe('SeoulApiClient', () => {
  it('역명으로 URL을 만들어 호출하고 변환 결과를 반환한다', async () => {
    const http = jest.fn().mockResolvedValue(success);
    const client = new SeoulApiClient(CONFIG, http);

    const trains = await client.fetchStationArrivals('증미');

    expect(http).toHaveBeenCalledWith(
      'http://example.test/api/subway/TESTKEY/json/realtimeStationArrival/0/20/%EC%A6%9D%EB%AF%B8',
    );
    expect(trains).toHaveLength(4);
  });

  it('호출할 때마다 호출 횟수를 센다', async () => {
    const client = new SeoulApiClient(CONFIG, jest.fn().mockResolvedValue(success));
    expect(client.getCallCount()).toBe(0);
    await client.fetchStationArrivals('증미');
    await client.fetchStationArrivals('가양');
    expect(client.getCallCount()).toBe(2);
  });

  it('호출 제한 코드는 UpstreamRateLimitedError로 변환한다', async () => {
    const http = jest.fn().mockResolvedValue({
      errorMessage: { status: 500, code: 'ERROR-337', message: '일일 트래픽 요청 제한을 초과하였습니다.' },
    });
    const client = new SeoulApiClient(CONFIG, http);
    await expect(client.fetchStationArrivals('증미')).rejects.toBeInstanceOf(UpstreamRateLimitedError);
  });

  it('네트워크 오류는 UpstreamUnavailableError로 변환한다', async () => {
    const http = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new SeoulApiClient(CONFIG, http);
    await expect(client.fetchStationArrivals('증미')).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('데이터 없음 코드는 오류가 아니라 빈 배열이다', async () => {
    const http = jest.fn().mockResolvedValue({
      errorMessage: { status: 200, code: 'INFO-200', message: '해당하는 데이터가 없습니다.', total: 0 },
      realtimeArrivalList: [],
    });
    const client = new SeoulApiClient(CONFIG, http);
    await expect(client.fetchStationArrivals('증미')).resolves.toEqual([]);
  });

  it('알 수 없는 오류 코드는 UpstreamUnavailableError로 변환한다', async () => {
    const http = jest.fn().mockResolvedValue({
      errorMessage: { status: 500, code: 'ERROR-500', message: '서버 오류' },
    });
    const client = new SeoulApiClient(CONFIG, http);
    await expect(client.fetchStationArrivals('증미')).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});
```

HTTP 호출을 생성자로 주입받는 형태로 설계했다. 이렇게 하면 실제 네트워크 없이 클라이언트의 오류 분류 로직을 전부 테스트할 수 있다 — API 키가 없는 지금 상황에서 필요한 구조다.

- [ ] **Step 4: 테스트 실패 확인**

```bash
cd backend && npx jest src/seoul-api/seoul-api.client.spec.ts
```

Expected: FAIL — `Cannot find module './seoul-api.client'`

- [ ] **Step 5: 구현**

`backend/src/seoul-api/seoul-api.client.ts`:

```ts
import { Logger } from '@nestjs/common';
import axios from 'axios';
import { AppConfig } from '../config/configuration';
import { RawTrain } from '../trains/types';
import { UpstreamRateLimitedError, UpstreamUnavailableError } from './seoul-api.errors';
import { mapArrivalResponse } from './seoul-api.mapper';
import { SeoulArrivalResponse } from './seoul-api.types';

export type HttpGet = (url: string) => Promise<SeoulArrivalResponse>;

const RATE_LIMIT_CODES = ['ERROR-337'];
const NO_DATA_CODES = ['INFO-200'];
const OK_CODES = ['INFO-000'];

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

  async fetchStationArrivals(stationName: string): Promise<RawTrain[]> {
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
    if (code && !OK_CODES.includes(code)) {
      this.logger.warn(`알 수 없는 응답 코드: ${code} ${body.errorMessage?.message ?? ''}`);
      throw new UpstreamUnavailableError();
    }

    return mapArrivalResponse(body);
  }
}
```

`backend/src/seoul-api/seoul-api.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { loadConfig } from '../config/configuration';
import { SeoulApiClient } from './seoul-api.client';

@Module({
  providers: [{ provide: SeoulApiClient, useFactory: () => new SeoulApiClient(loadConfig()) }],
  exports: [SeoulApiClient],
})
export class SeoulApiModule {}
```

`backend/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LinesModule } from './lines/lines.module';
import { SeoulApiModule } from './seoul-api/seoul-api.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), LinesModule, SeoulApiModule],
})
export class AppModule {}
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
cd backend && npx jest src/seoul-api
```

Expected: PASS — mapper 16 tests + client 6 tests

- [ ] **Step 7: 커밋**

```bash
git add backend/src/config backend/src/seoul-api backend/src/app.module.ts backend/.env.example backend/package.json backend/package-lock.json
git commit -m "feat(backend): 설정 로딩과 서울시 API 클라이언트"
```

---

## Task 6: TrainsService — 방향 분류, 급행 필터, stale

**Files:**
- Create: `backend/src/trains/trains.service.ts`
- Test: `backend/src/trains/trains.service.spec.ts`

**Interfaces:**
- Consumes: `LinesService`, `SeoulApiClient`, `CacheService`, `positionRatioOf`, `RawTrain`, `TrainsResponse`
- Produces: `TrainsService.getTrains(lineId: string, stationId: string): Promise<TrainsResponse>`
- Produces: `StationNotFoundError`, `LineNotFoundError` (`backend/src/trains/trains.errors.ts`)

이 Task가 백엔드 도메인 로직의 중심이다. 네 가지를 한다 — 열차를 방향별로 나누고, 선택한 역에 서지 않는 급행을 걸러내고, 역명을 실제 역으로 매칭하고, 외부 실패 시 stale 데이터로 대체한다.

- [ ] **Step 1: 오류 타입 작성**

`backend/src/trains/trains.errors.ts`:

```ts
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
```

- [ ] **Step 2: 실패 테스트 작성**

`backend/src/trains/trains.service.spec.ts`:

```ts
import { CacheService } from '../common/cache.service';
import { LinesService } from '../lines/lines.service';
import { UpstreamUnavailableError } from '../seoul-api/seoul-api.errors';
import { RawTrain } from './types';
import { LineNotFoundError, StationNotFoundError } from './trains.errors';
import { TrainsService } from './trains.service';

const 증미 = '9-8';

function rawTrain(over: Partial<RawTrain> = {}): RawTrain {
  return {
    trainId: 'T1',
    trainType: 'LOCAL',
    currentStationName: '등촌',
    remainingSeconds: 120,
    status: 'TRAVELING',
    directionId: 'UP',
    ...over,
  };
}

function build(fetchImpl: () => Promise<RawTrain[]>) {
  const lines = new LinesService();
  const cache = new CacheService(10_000, 300_000);
  const client = { fetchStationArrivals: jest.fn(fetchImpl) };
  const service = new TrainsService(lines, cache, client as never);
  return { service, client, cache };
}

describe('TrainsService', () => {
  it('없는 노선은 LineNotFoundError를 던진다', async () => {
    const { service } = build(async () => []);
    await expect(service.getTrains('2', 증미)).rejects.toBeInstanceOf(LineNotFoundError);
  });

  it('없는 역은 StationNotFoundError를 던진다', async () => {
    const { service } = build(async () => []);
    await expect(service.getTrains('9', '9-999')).rejects.toBeInstanceOf(StationNotFoundError);
  });

  it('선택한 역 정보를 응답에 담는다', async () => {
    const { service } = build(async () => []);
    const result = await service.getTrains('9', 증미);
    expect(result.station.name).toBe('증미');
    expect(result.line.name).toBe('서울 지하철 9호선');
  });

  it('열차가 없어도 방향 블록 두 개를 항상 반환한다', async () => {
    const { service } = build(async () => []);
    const result = await service.getTrains('9', 증미);
    expect(result.directions.map((d) => d.directionId)).toEqual(['UP', 'DOWN']);
    expect(result.directions[0].directionName).toBe('개화 방면');
    expect(result.directions[1].directionName).toBe('중앙보훈병원 방면');
    expect(result.directions[0].trains).toEqual([]);
  });

  it('열차를 방향별로 나눈다', async () => {
    const { service } = build(async () => [
      rawTrain({ trainId: 'U1', directionId: 'UP' }),
      rawTrain({ trainId: 'D1', directionId: 'DOWN', currentStationName: '가양' }),
    ]);
    const result = await service.getTrains('9', 증미);
    expect(result.directions[0].trains.map((t) => t.trainId)).toEqual(['U1']);
    expect(result.directions[1].trains.map((t) => t.trainId)).toEqual(['D1']);
  });

  it('역명을 실제 역으로 매칭해 order를 채운다', async () => {
    const { service } = build(async () => [rawTrain({ currentStationName: '등촌' })]);
    const result = await service.getTrains('9', 증미);
    expect(result.directions[0].trains[0].currentStation).toEqual({
      stationId: '9-9', name: '등촌', order: 9, isExpressStop: false,
    });
  });

  it('status에 맞는 positionRatio를 채운다', async () => {
    const { service } = build(async () => [rawTrain({ status: 'APPROACHING' })]);
    const result = await service.getTrains('9', 증미);
    expect(result.directions[0].trains[0].positionRatio).toBe(0.75);
  });

  it('매칭되지 않는 역명의 열차는 버린다', async () => {
    const { service } = build(async () => [rawTrain({ currentStationName: '강남' })]);
    const result = await service.getTrains('9', 증미);
    expect(result.directions[0].trains).toEqual([]);
  });

  it('급행 미정차역에서는 급행 열차를 제외한다', async () => {
    const { service } = build(async () => [
      rawTrain({ trainId: 'EX', trainType: 'EXPRESS' }),
      rawTrain({ trainId: 'LO', trainType: 'LOCAL' }),
    ]);
    const result = await service.getTrains('9', 증미);
    expect(result.directions[0].trains.map((t) => t.trainId)).toEqual(['LO']);
  });

  it('급행 정차역에서는 급행 열차를 유지한다', async () => {
    const 염창 = '9-10';
    const { service } = build(async () => [
      rawTrain({ trainId: 'EX', trainType: 'EXPRESS', currentStationName: '신목동' }),
    ]);
    const result = await service.getTrains('9', 염창);
    expect(result.directions[0].trains.map((t) => t.trainId)).toEqual(['EX']);
  });

  it('도착이 빠른 열차부터 정렬한다', async () => {
    const { service } = build(async () => [
      rawTrain({ trainId: 'LATE', remainingSeconds: 300 }),
      rawTrain({ trainId: 'SOON', remainingSeconds: 60 }),
    ]);
    const result = await service.getTrains('9', 증미);
    expect(result.directions[0].trains.map((t) => t.trainId)).toEqual(['SOON', 'LATE']);
  });

  it('도착 시간을 모르는 열차는 뒤로 보낸다', async () => {
    const { service } = build(async () => [
      rawTrain({ trainId: 'UNKNOWN', remainingSeconds: null }),
      rawTrain({ trainId: 'KNOWN', remainingSeconds: 300 }),
    ]);
    const result = await service.getTrains('9', 증미);
    expect(result.directions[0].trains.map((t) => t.trainId)).toEqual(['KNOWN', 'UNKNOWN']);
  });

  it('TTL 이내 재요청은 외부 API를 다시 호출하지 않는다', async () => {
    const { service, client } = build(async () => [rawTrain()]);
    await service.getTrains('9', 증미);
    await service.getTrains('9', 증미);
    expect(client.fetchStationArrivals).toHaveBeenCalledTimes(1);
  });

  it('정상 응답은 stale이 false다', async () => {
    const { service } = build(async () => [rawTrain()]);
    expect((await service.getTrains('9', 증미)).stale).toBe(false);
  });

  it('외부 실패 시 마지막 성공 데이터를 stale로 반환한다', async () => {
    jest.useFakeTimers();
    try {
      let shouldFail = false;
      const { service } = build(async () => {
        if (shouldFail) throw new UpstreamUnavailableError();
        return [rawTrain({ trainId: 'CACHED' })];
      });

      const first = await service.getTrains('9', 증미);
      expect(first.stale).toBe(false);

      shouldFail = true;
      jest.advanceTimersByTime(10_001);

      const second = await service.getTrains('9', 증미);
      expect(second.stale).toBe(true);
      expect(second.directions[0].trains[0].trainId).toBe('CACHED');
      expect(second.updatedAt).toBe(first.updatedAt);
    } finally {
      jest.useRealTimers();
    }
  });

  it('stale 데이터도 없으면 외부 오류를 그대로 던진다', async () => {
    const { service } = build(async () => {
      throw new UpstreamUnavailableError();
    });
    await expect(service.getTrains('9', 증미)).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
cd backend && npx jest src/trains/trains.service.spec.ts
```

Expected: FAIL — `Cannot find module './trains.service'`

- [ ] **Step 4: 구현**

`backend/src/trains/trains.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../common/cache.service';
import { LinesService } from '../lines/lines.service';
import { DirectionId, Station } from '../lines/types';
import { SeoulApiClient } from '../seoul-api/seoul-api.client';
import { positionRatioOf } from './train-position';
import { LineNotFoundError, StationNotFoundError } from './trains.errors';
import { DirectionBlock, RawTrain, Train, TrainsResponse } from './types';

/** 노선별 방향 이름. 노선을 추가할 때 여기에 한 줄을 더한다. */
const DIRECTION_NAMES: Record<string, Record<DirectionId, string>> = {
  '9': { UP: '개화 방면', DOWN: '중앙보훈병원 방면' },
};

const DIRECTION_ORDER: DirectionId[] = ['UP', 'DOWN'];

@Injectable()
export class TrainsService {
  private readonly logger = new Logger(TrainsService.name);

  constructor(
    private readonly lines: LinesService,
    private readonly cache: CacheService,
    private readonly client: SeoulApiClient,
  ) {}

  async getTrains(lineId: string, stationId: string): Promise<TrainsResponse> {
    const line = this.lines.getLine(lineId);
    if (!line) throw new LineNotFoundError(lineId);

    const station = this.lines.findStationById(lineId, stationId);
    if (!station) throw new StationNotFoundError(stationId);

    const key = `trains:${lineId}:${stationId}`;

    const fresh = this.cache.get<RawTrain[]>(key);
    if (fresh) {
      return this.build(line.lineId, line.lineName, station, fresh, new Date().toISOString(), false);
    }

    try {
      const raws = await this.client.fetchStationArrivals(station.name);
      this.cache.set(key, raws);
      return this.build(line.lineId, line.lineName, station, raws, new Date().toISOString(), false);
    } catch (error) {
      const stale = this.cache.getStale<RawTrain[]>(key);
      if (!stale) throw error;

      this.logger.warn(`외부 API 실패, stale 데이터로 응답합니다 (${station.name})`);
      return this.build(
        line.lineId,
        line.lineName,
        station,
        stale.value,
        new Date(stale.storedAt).toISOString(),
        true,
      );
    }
  }

  private build(
    lineId: string,
    lineName: string,
    station: Station,
    raws: RawTrain[],
    updatedAt: string,
    stale: boolean,
  ): TrainsResponse {
    const names = DIRECTION_NAMES[lineId] ?? { UP: '상행', DOWN: '하행' };

    const directions: DirectionBlock[] = DIRECTION_ORDER.map((directionId) => ({
      directionId,
      directionName: names[directionId],
      trains: raws
        .filter((raw) => raw.directionId === directionId)
        .map((raw) => this.toTrain(lineId, station, raw))
        .filter((train): train is Train => train !== null)
        .sort(byArrivalSoonest),
    }));

    return {
      line: { id: lineId, name: lineName },
      station,
      directions,
      updatedAt,
      stale,
    };
  }

  private toTrain(lineId: string, selected: Station, raw: RawTrain): Train | null {
    const current = this.lines.findStationByName(lineId, raw.currentStationName);
    if (!current) {
      // 역명 표기가 예상과 다르면 여기서 드러난다(스펙 2절 2번).
      this.logger.warn(`역명 매칭 실패: "${raw.currentStationName}" (노선 ${lineId})`);
      return null;
    }

    // 선택한 역에 서지 않는 급행은 사용자에게 의미가 없으므로 제외한다.
    if (raw.trainType === 'EXPRESS' && !selected.isExpressStop) return null;

    return {
      trainId: raw.trainId,
      trainType: raw.trainType,
      currentStation: current,
      remainingSeconds: raw.remainingSeconds,
      status: raw.status,
      positionRatio: positionRatioOf(raw.status),
    };
  }
}

/** 도착이 빠른 순. 시간을 모르는 열차는 맨 뒤로 보낸다. */
function byArrivalSoonest(a: Train, b: Train): number {
  const left = a.remainingSeconds ?? Number.POSITIVE_INFINITY;
  const right = b.remainingSeconds ?? Number.POSITIVE_INFINITY;
  return left - right;
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd backend && npx jest src/trains/trains.service.spec.ts
```

Expected: PASS — 17 tests

- [ ] **Step 6: 커밋**

```bash
git add backend/src/trains
git commit -m "feat(backend): 방향 분류, 급행 필터, stale 대체 로직"
```

---

## Task 7: 열차 API 엔드포인트 + 오류 필터

**Files:**
- Create: `backend/src/trains/trains.controller.ts`, `backend/src/trains/trains.module.ts`
- Create: `backend/src/common/filters/domain-exception.filter.ts`
- Modify: `backend/src/main.ts`, `backend/src/app.module.ts`, `backend/src/seoul-api/seoul-api.module.ts`
- Test: `backend/test/trains.e2e-spec.ts`

**Interfaces:**
- Consumes: `TrainsService.getTrains`, Task 5·6의 오류 타입
- Produces: `GET /api/lines/:lineId/stations/:stationId/trains` → `TrainsResponse` 또는 오류 응답

- [ ] **Step 1: 오류 필터 작성**

`backend/src/common/filters/domain-exception.filter.ts`:

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Response } from 'express';
import {
  UpstreamRateLimitedError,
  UpstreamUnavailableError,
} from '../../seoul-api/seoul-api.errors';
import { LineNotFoundError, StationNotFoundError } from '../../trains/trains.errors';

type Mapped = { status: number; code: string };

function classify(error: unknown): Mapped | null {
  if (error instanceof LineNotFoundError) return { status: 404, code: 'LINE_NOT_FOUND' };
  if (error instanceof StationNotFoundError) return { status: 404, code: 'STATION_NOT_FOUND' };
  if (error instanceof UpstreamRateLimitedError) return { status: 503, code: 'UPSTREAM_RATE_LIMITED' };
  if (error instanceof UpstreamUnavailableError) return { status: 502, code: 'UPSTREAM_UNAVAILABLE' };
  return null;
}

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const mapped = classify(error);

    if (mapped) {
      response.status(mapped.status).json({
        error: { code: mapped.code, message: (error as Error).message },
      });
      return;
    }

    if (error instanceof HttpException) {
      const body = error.getResponse();
      response.status(error.getStatus()).json(
        typeof body === 'object' && body !== null && 'error' in body
          ? body
          : { error: { code: 'HTTP_ERROR', message: error.message } },
      );
      return;
    }

    response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' },
    });
  }
}
```

- [ ] **Step 2: 컨트롤러와 모듈 배선**

`backend/src/trains/trains.controller.ts`:

```ts
import { Controller, Get, Param } from '@nestjs/common';
import { TrainsService } from './trains.service';

@Controller('lines')
export class TrainsController {
  constructor(private readonly trains: TrainsService) {}

  @Get(':lineId/stations/:stationId/trains')
  getTrains(@Param('lineId') lineId: string, @Param('stationId') stationId: string) {
    return this.trains.getTrains(lineId, stationId);
  }
}
```

`backend/src/trains/trains.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CacheService } from '../common/cache.service';
import { loadConfig } from '../config/configuration';
import { LinesModule } from '../lines/lines.module';
import { SeoulApiModule } from '../seoul-api/seoul-api.module';
import { TrainsController } from './trains.controller';
import { TrainsService } from './trains.service';

@Module({
  imports: [LinesModule, SeoulApiModule],
  controllers: [TrainsController],
  providers: [
    TrainsService,
    {
      provide: CacheService,
      useFactory: () => {
        const config = loadConfig();
        return new CacheService(config.cacheTtlMs, config.staleMaxAgeMs);
      },
    },
  ],
})
export class TrainsModule {}
```

`backend/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LinesModule } from './lines/lines.module';
import { TrainsModule } from './trains/trains.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), LinesModule, TrainsModule],
})
export class AppModule {}
```

`backend/src/main.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { loadConfig } from './config/configuration';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableCors();
  await app.listen(config.port);
}
bootstrap();
```

`enableCors()`는 개발 중 Vite 개발 서버(5173)가 백엔드(3000)를 직접 호출하기 위해 필요하다. 프로덕션에서는 nginx가 같은 오리진으로 프록시하므로 무해하다.

- [ ] **Step 3: e2e 실패 테스트 작성**

`backend/test/trains.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CacheService } from '../src/common/cache.service';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { LinesModule } from '../src/lines/lines.module';
import { SeoulApiClient } from '../src/seoul-api/seoul-api.client';
import { UpstreamRateLimitedError } from '../src/seoul-api/seoul-api.errors';
import { TrainsController } from '../src/trains/trains.controller';
import { TrainsService } from '../src/trains/trains.service';
import { RawTrain } from '../src/trains/types';

const 증미 = '9-8';

async function createApp(fetchImpl: () => Promise<RawTrain[]>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [LinesModule],
    controllers: [TrainsController],
    providers: [
      TrainsService,
      { provide: CacheService, useFactory: () => new CacheService(10_000, 300_000) },
      { provide: SeoulApiClient, useValue: { fetchStationArrivals: jest.fn(fetchImpl) } },
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
        trainId: '9134', trainType: 'LOCAL', currentStationName: '등촌',
        remainingSeconds: 125, status: 'DEPARTED', directionId: 'UP',
      },
    ]);

    const res = await request(app.getHttpServer()).get(`/api/lines/9/stations/${증미}/trains`).expect(200);

    expect(res.body.station.name).toBe('증미');
    expect(res.body.directions).toHaveLength(2);
    expect(res.body.directions[0].trains[0]).toMatchObject({
      trainId: '9134', trainType: 'LOCAL', remainingSeconds: 125, positionRatio: 0.25,
    });
    expect(res.body.stale).toBe(false);
    expect(typeof res.body.updatedAt).toBe('string');
  });

  it('없는 역은 404 STATION_NOT_FOUND', async () => {
    app = await createApp(async () => []);
    const res = await request(app.getHttpServer()).get('/api/lines/9/stations/9-999/trains').expect(404);
    expect(res.body.error.code).toBe('STATION_NOT_FOUND');
  });

  it('없는 노선은 404 LINE_NOT_FOUND', async () => {
    app = await createApp(async () => []);
    const res = await request(app.getHttpServer()).get(`/api/lines/2/stations/${증미}/trains`).expect(404);
    expect(res.body.error.code).toBe('LINE_NOT_FOUND');
  });

  it('호출 제한 초과이고 stale도 없으면 503', async () => {
    app = await createApp(async () => {
      throw new UpstreamRateLimitedError();
    });
    const res = await request(app.getHttpServer()).get(`/api/lines/9/stations/${증미}/trains`).expect(503);
    expect(res.body.error.code).toBe('UPSTREAM_RATE_LIMITED');
  });
});
```

- [ ] **Step 4: supertest 설치 후 e2e 실행**

```bash
cd backend
npm install --save-dev supertest @types/supertest
npx jest --config test/jest-e2e.json test/trains.e2e-spec.ts
```

Expected: PASS — 4 tests

Step 1~2에서 컨트롤러와 필터를 이미 만들었으므로 여기서는 통과해야 한다. FAIL이면 오류 메시지를 읽고 배선을 고친다. 자주 나오는 원인 두 가지다 — `app.setGlobalPrefix('api')`를 테스트에서 빠뜨렸거나, `DomainExceptionFilter`를 등록하지 않아 오류 응답이 NestJS 기본 형식으로 나오는 경우다.

- [ ] **Step 5: 전체 백엔드 테스트 실행**

```bash
cd backend
npx jest
npx jest --config test/jest-e2e.json
```

Expected: 단위 테스트 전부 PASS, e2e 4 tests PASS

- [ ] **Step 6: 수동 확인**

`.env`를 만들고 아무 값이나 키에 넣는다(실제 호출은 실패하지만 서버 기동은 확인된다):

```bash
cd backend
cp .env.example .env
# .env의 SEOUL_OPEN_API_KEY에 임의 문자열 입력
npm run start:dev
```

```bash
curl -i http://localhost:3000/api/lines/9/stations/9-999/trains
```

Expected: 404 + `STATION_NOT_FOUND`. 확인 후 서버 종료.

- [ ] **Step 7: 커밋**

```bash
git add backend
git commit -m "feat(backend): 열차 조회 엔드포인트와 도메인 오류 필터"
```

---

## Task 8: 프론트엔드 스캐폴딩 + 타입 + API 레이어

**Files:**
- Create: `frontend/` (Vite React TS 템플릿 전체)
- Create: `frontend/src/types/subway.ts`
- Create: `frontend/src/api/client.ts`, `frontend/src/api/subway.ts`
- Modify: `frontend/vite.config.ts`
- Test: `frontend/src/api/subway.test.ts`

**Interfaces:**
- Produces: 타입 `Station`, `Train`, `DirectionBlock`, `TrainsResponse`, `StationsResponse`, `DirectionId`, `TrainType`, `TrainStatus`, `ApiError`
- Produces: `getStations(): Promise<StationsResponse>`, `getTrains(stationId: string): Promise<TrainsResponse>`
- Produces: `ApiError` 클래스 — `code: string`, `message: string`

- [ ] **Step 1: Vite 프로젝트 생성**

```bash
cd C:/dev/metro
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Vite 설정**

`frontend/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
  },
});
```

`frontend/src/test-setup.ts`:

```ts
import '@testing-library/jest-dom';
```

`frontend/package.json`의 `scripts`에 추가:

```json
"test": "vitest run",
"test:watch": "vitest"
```

개발 중에는 Vite 프록시가 `/api`를 백엔드로 넘긴다. 프로덕션에서는 nginx가 같은 일을 한다. 덕분에 프론트엔드 코드는 두 환경에서 동일하게 `/api/...`만 호출하면 된다.

- [ ] **Step 3: 타입 정의**

`frontend/src/types/subway.ts`:

```ts
export type DirectionId = 'UP' | 'DOWN';
export type TrainType = 'EXPRESS' | 'LOCAL';
export type TrainStatus = 'ARRIVED' | 'DEPARTED' | 'TRAVELING' | 'APPROACHING';

export type Station = {
  stationId: string;
  name: string;
  order: number;
  isExpressStop: boolean;
};

export type Train = {
  trainId: string;
  trainType: TrainType;
  currentStation: Station;
  remainingSeconds: number | null;
  status: TrainStatus;
  positionRatio: number;
};

export type DirectionBlock = {
  directionId: DirectionId;
  directionName: string;
  trains: Train[];
};

export type TrainsResponse = {
  line: { id: string; name: string };
  station: Station;
  directions: DirectionBlock[];
  updatedAt: string;
  stale: boolean;
};

export type StationsResponse = {
  lineId: string;
  lineName: string;
  stations: Station[];
};
```

- [ ] **Step 4: 실패 테스트 작성**

`frontend/src/api/subway.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import { getStations, getTrains } from './subway';

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('getStations', () => {
  it('역 목록 엔드포인트를 호출한다', async () => {
    const fetchMock = mockFetch(200, { lineId: '9', lineName: '서울 지하철 9호선', stations: [] });
    const result = await getStations();
    expect(fetchMock).toHaveBeenCalledWith('/api/lines/9/stations');
    expect(result.lineId).toBe('9');
  });
});

describe('getTrains', () => {
  it('역 ID로 열차 엔드포인트를 호출한다', async () => {
    const fetchMock = mockFetch(200, { directions: [] });
    await getTrains('9-8');
    expect(fetchMock).toHaveBeenCalledWith('/api/lines/9/stations/9-8/trains');
  });

  it('역 ID를 URL 인코딩한다', async () => {
    const fetchMock = mockFetch(200, { directions: [] });
    await getTrains('9 8');
    expect(fetchMock).toHaveBeenCalledWith('/api/lines/9/stations/9%208/trains');
  });

  it('오류 응답을 ApiError로 변환한다', async () => {
    mockFetch(404, { error: { code: 'STATION_NOT_FOUND', message: '지원하지 않는 역입니다' } });
    await expect(getTrains('9-999')).rejects.toBeInstanceOf(ApiError);
    await expect(getTrains('9-999')).rejects.toMatchObject({ code: 'STATION_NOT_FOUND' });
  });

  it('오류 본문을 읽을 수 없으면 UNKNOWN 코드를 쓴다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      }),
    );
    await expect(getTrains('9-8')).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('네트워크 실패는 NETWORK_ERROR로 변환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(getTrains('9-8')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
```

- [ ] **Step 5: 테스트 실패 확인**

```bash
cd frontend && npm test
```

Expected: FAIL — `Failed to resolve import "./client"`

- [ ] **Step 6: 구현**

`frontend/src/api/client.ts`:

```ts
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
```

`frontend/src/api/subway.ts`:

```ts
import { StationsResponse, TrainsResponse } from '../types/subway';
import { requestJson } from './client';

const LINE_ID = '9';

export function getStations(): Promise<StationsResponse> {
  return requestJson<StationsResponse>(`/api/lines/${LINE_ID}/stations`);
}

export function getTrains(stationId: string): Promise<TrainsResponse> {
  return requestJson<TrainsResponse>(
    `/api/lines/${LINE_ID}/stations/${encodeURIComponent(stationId)}/trains`,
  );
}
```

- [ ] **Step 7: 테스트 통과 확인**

```bash
cd frontend && npm test
```

Expected: PASS — 6 tests

- [ ] **Step 8: 커밋**

```bash
cd C:/dev/metro
git add frontend
git commit -m "feat(frontend): Vite 스캐폴딩과 API 레이어"
```

---

## Task 9: 트랙 좌표 계산 (순수 함수)

**Files:**
- Create: `frontend/src/utils/trackPosition.ts`
- Test: `frontend/src/utils/trackPosition.test.ts`

**Interfaces:**
- Consumes: Task 8의 `Station`, `Train`, `DirectionId`
- Produces: `TRACK_SPAN = 4`
- Produces: `buildTrack(stations: Station[], selected: Station, direction: DirectionId, span?: number): Station[]` — 왼쪽부터 오른쪽 순서이며 마지막 원소가 항상 `selected`
- Produces: `trainLeftPercent(track: Station[], train: Train): number | null` — 트랙 밖이면 `null`
- Produces: `formatRemaining(seconds: number | null): string`

스펙 7.3절의 두 규칙을 구현한다 — 선택역 + 앞 4개 역만 그리고, 양방향 모두 오른쪽 끝이 선택역이다.

- [ ] **Step 1: 실패 테스트 작성**

`frontend/src/utils/trackPosition.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Station, Train } from '../types/subway';
import { buildTrack, formatRemaining, trainLeftPercent, TRACK_SPAN } from './trackPosition';

const stations: Station[] = Array.from({ length: 38 }, (_, i) => ({
  stationId: `9-${i + 1}`,
  name: `역${i + 1}`,
  order: i + 1,
  isExpressStop: false,
}));

const 증미 = stations[7];   // order 8
const 개화 = stations[0];   // order 1
const 중앙보훈병원 = stations[37]; // order 38

function trainAt(station: Station, positionRatio: number): Train {
  return {
    trainId: 'T',
    trainType: 'LOCAL',
    currentStation: station,
    remainingSeconds: 120,
    status: 'TRAVELING',
    positionRatio,
  };
}

describe('buildTrack', () => {
  it('기본 구간 길이는 4다', () => {
    expect(TRACK_SPAN).toBe(4);
  });

  it('UP 방향은 order가 큰 역에서 시작해 선택역으로 끝난다', () => {
    const track = buildTrack(stations, 증미, 'UP');
    expect(track.map((s) => s.order)).toEqual([12, 11, 10, 9, 8]);
  });

  it('DOWN 방향은 order가 작은 역에서 시작해 선택역으로 끝난다', () => {
    const track = buildTrack(stations, 증미, 'DOWN');
    expect(track.map((s) => s.order)).toEqual([4, 5, 6, 7, 8]);
  });

  it('두 방향 모두 마지막 원소가 선택한 역이다', () => {
    expect(buildTrack(stations, 증미, 'UP').at(-1)?.order).toBe(8);
    expect(buildTrack(stations, 증미, 'DOWN').at(-1)?.order).toBe(8);
  });

  it('노선 끝에서는 있는 역만큼만 담는다', () => {
    expect(buildTrack(stations, 개화, 'DOWN').map((s) => s.order)).toEqual([1]);
    expect(buildTrack(stations, 중앙보훈병원, 'UP').map((s) => s.order)).toEqual([38]);
  });

  it('구간 길이를 조정할 수 있다', () => {
    expect(buildTrack(stations, 증미, 'UP', 2).map((s) => s.order)).toEqual([10, 9, 8]);
  });
});

describe('trainLeftPercent', () => {
  const track = buildTrack(stations, 증미, 'UP'); // [12, 11, 10, 9, 8]

  it('트랙 왼쪽 끝의 열차는 0%다', () => {
    expect(trainLeftPercent(track, trainAt(stations[11], 0))).toBe(0);
  });

  it('선택역에 도착한 열차는 100%다', () => {
    expect(trainLeftPercent(track, trainAt(증미, 0))).toBe(100);
  });

  it('positionRatio만큼 오른쪽으로 이동한다', () => {
    // index 3(order 9) + 0.5 = 3.5, 트랙 간격 4개 → 87.5%
    expect(trainLeftPercent(track, trainAt(stations[8], 0.5))).toBe(87.5);
  });

  it('트랙 밖의 역에 있는 열차는 null이다', () => {
    expect(trainLeftPercent(track, trainAt(stations[20], 0.5))).toBeNull();
  });

  it('100%를 넘지 않도록 자른다', () => {
    expect(trainLeftPercent(track, trainAt(증미, 0.75))).toBe(100);
  });

  it('역이 하나뿐인 트랙에서는 100%를 반환한다', () => {
    const single = buildTrack(stations, 개화, 'DOWN');
    expect(trainLeftPercent(single, trainAt(개화, 0))).toBe(100);
  });
});

describe('formatRemaining', () => {
  it('1분 미만은 초로 표시한다', () => {
    expect(formatRemaining(45)).toBe('45초');
  });

  it('1분 이상은 분으로 올림한다', () => {
    expect(formatRemaining(60)).toBe('1분');
    expect(formatRemaining(125)).toBe('3분');
  });

  it('알 수 없으면 대시로 표시한다', () => {
    expect(formatRemaining(null)).toBe('—');
  });

  it('0 이하는 곧 도착으로 표시한다', () => {
    expect(formatRemaining(0)).toBe('곧 도착');
  });
});
```

`formatRemaining(125)`가 `'3분'`인 이유는 올림이기 때문이다. 2분 5초 남았을 때 "2분"이라고 하면 실제보다 빨리 온다고 오해하게 된다. 출발 판단에서는 늦게 잡아주는 쪽이 안전하다.

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd frontend && npm test
```

Expected: FAIL — `Failed to resolve import "./trackPosition"`

- [ ] **Step 3: 구현**

`frontend/src/utils/trackPosition.ts`:

```ts
import { DirectionId, Station, Train } from '../types/subway';

/** 선택한 역 앞으로 몇 개 역까지 트랙에 그릴지. 역간 1.5~2분이므로 약 8분치 시야다. */
export const TRACK_SPAN = 4;

/**
 * 트랙에 그릴 역들을 왼쪽부터 오른쪽 순서로 만든다.
 * 마지막 원소는 항상 선택한 역이다 — 두 방향 패널의 오른쪽 끝을 통일해
 * 사용자가 매번 어느 쪽이 자기 역인지 다시 읽지 않게 한다(스펙 7.3절).
 */
export function buildTrack(
  stations: Station[],
  selected: Station,
  direction: DirectionId,
  span: number = TRACK_SPAN,
): Station[] {
  // UP(개화 방면)은 order가 감소하는 방향으로 달리므로 열차는 order가 큰 쪽에서 온다.
  const step = direction === 'UP' ? 1 : -1;
  const byOrder = new Map(stations.map((s) => [s.order, s]));

  const track: Station[] = [];
  for (let distance = span; distance >= 1; distance -= 1) {
    const station = byOrder.get(selected.order + step * distance);
    if (station) track.push(station);
  }
  track.push(selected);
  return track;
}

/**
 * 트랙 위에서 열차의 left 위치를 퍼센트로 계산한다.
 * 열차가 트랙 범위 밖에 있으면 null — 호출부에서 "다음 열차 N분" 텍스트로 처리한다.
 */
export function trainLeftPercent(track: Station[], train: Train): number | null {
  const index = track.findIndex((s) => s.stationId === train.currentStation.stationId);
  if (index === -1) return null;
  if (track.length <= 1) return 100;

  const position = index + train.positionRatio;
  const percent = (position / (track.length - 1)) * 100;
  return Math.min(100, Math.max(0, percent));
}

/** 남은 시간을 사람이 읽는 문자열로. 분은 올림한다 — 늦게 잡는 쪽이 안전하다. */
export function formatRemaining(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds <= 0) return '곧 도착';
  if (seconds < 60) return `${seconds}초`;
  return `${Math.ceil(seconds / 60)}분`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd frontend && npm test
```

Expected: PASS — API 6 tests + trackPosition 17 tests

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/utils
git commit -m "feat(frontend): 트랙 좌표 계산과 시간 표시 유틸"
```

---

## Task 10: 훅 — 역 목록, 선택 역 유지, 열차 조회

**Files:**
- Create: `frontend/src/hooks/useStations.ts`
- Create: `frontend/src/hooks/useSelectedStation.ts`
- Create: `frontend/src/hooks/useTrainData.ts`
- Test: `frontend/src/hooks/useSelectedStation.test.ts`, `frontend/src/hooks/useTrainData.test.ts`

**Interfaces:**
- Consumes: Task 8의 `getStations`, `getTrains`, `ApiError`, 타입들
- Produces: `useStations(): { stations: Station[]; lineName: string; loading: boolean; error: ApiError | null }`
- Produces: `useSelectedStation(stations: Station[]): { selected: Station | null; select: (stationId: string) => void }`
- Produces: `useTrainData(stationId: string | null): { data: TrainsResponse | null; loading: boolean; error: ApiError | null; refresh: () => void; canRefresh: boolean }`
- Produces: `STORAGE_KEY = 'subway-tracker:selected-station'`, `REFRESH_COOLDOWN_MS = 3000`

`useTrainData`가 스펙 7.1절의 폴링 확장 지점이다. 지금은 세 시점에서만 조회하며, 나중에 이 훅 안에 `setInterval`을 넣으면 컴포넌트 수정 없이 폴링이 켜진다.

- [ ] **Step 1: useSelectedStation 실패 테스트 작성**

`frontend/src/hooks/useSelectedStation.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Station } from '../types/subway';
import { STORAGE_KEY, useSelectedStation } from './useSelectedStation';

const stations: Station[] = [
  { stationId: '9-8', name: '증미', order: 8, isExpressStop: false },
  { stationId: '9-9', name: '등촌', order: 9, isExpressStop: false },
];

beforeEach(() => localStorage.clear());

describe('useSelectedStation', () => {
  it('저장된 역이 없으면 선택 없음으로 시작한다', () => {
    const { result } = renderHook(() => useSelectedStation(stations));
    expect(result.current.selected).toBeNull();
  });

  it('역을 선택하면 상태와 localStorage에 반영된다', () => {
    const { result } = renderHook(() => useSelectedStation(stations));
    act(() => result.current.select('9-9'));
    expect(result.current.selected?.name).toBe('등촌');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('9-9');
  });

  it('저장된 역이 있으면 그 역으로 시작한다', () => {
    localStorage.setItem(STORAGE_KEY, '9-8');
    const { result } = renderHook(() => useSelectedStation(stations));
    expect(result.current.selected?.name).toBe('증미');
  });

  it('저장된 역이 목록에 없으면 선택 없음으로 시작한다', () => {
    localStorage.setItem(STORAGE_KEY, '9-999');
    const { result } = renderHook(() => useSelectedStation(stations));
    expect(result.current.selected).toBeNull();
  });

  it('역 목록이 아직 비어 있으면 선택하지 않는다', () => {
    localStorage.setItem(STORAGE_KEY, '9-8');
    const { result } = renderHook(() => useSelectedStation([]));
    expect(result.current.selected).toBeNull();
  });

  it('목록이 나중에 도착하면 저장된 역을 복원한다', () => {
    localStorage.setItem(STORAGE_KEY, '9-8');
    const { result, rerender } = renderHook(({ list }) => useSelectedStation(list), {
      initialProps: { list: [] as Station[] },
    });
    expect(result.current.selected).toBeNull();
    rerender({ list: stations });
    expect(result.current.selected?.name).toBe('증미');
  });
});
```

마지막 테스트가 중요하다. 역 목록은 비동기로 오므로 첫 렌더에는 빈 배열이다. 그때 저장된 역을 복원하지 못하고 끝나면 사용자는 매번 역을 다시 골라야 한다.

- [ ] **Step 2: useTrainData 실패 테스트 작성**

`frontend/src/hooks/useTrainData.test.ts`:

```ts
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/subway';
import { ApiError } from '../api/client';
import { TrainsResponse } from '../types/subway';
import { useTrainData } from './useTrainData';

const response = {
  line: { id: '9', name: '서울 지하철 9호선' },
  station: { stationId: '9-8', name: '증미', order: 8, isExpressStop: false },
  directions: [],
  updatedAt: '2026-07-22T14:00:00+09:00',
  stale: false,
} as TrainsResponse;

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useTrainData', () => {
  it('역 ID가 null이면 조회하지 않는다', () => {
    const spy = vi.spyOn(api, 'getTrains');
    renderHook(() => useTrainData(null));
    expect(spy).not.toHaveBeenCalled();
  });

  it('역 ID가 주어지면 즉시 한 번 조회한다', async () => {
    const spy = vi.spyOn(api, 'getTrains').mockResolvedValue(response);
    const { result } = renderHook(() => useTrainData('9-8'));
    await waitFor(() => expect(result.current.data).toEqual(response));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('자동으로 재조회하지 않는다', async () => {
    const spy = vi.spyOn(api, 'getTrains').mockResolvedValue(response);
    const { result } = renderHook(() => useTrainData('9-8'));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('refresh를 부르면 다시 조회한다', async () => {
    const spy = vi.spyOn(api, 'getTrains').mockResolvedValue(response);
    const { result } = renderHook(() => useTrainData('9-8'));
    await waitFor(() => expect(result.current.canRefresh).toBe(false));
    await act(async () => {
      vi.advanceTimersByTime(3001);
    });
    await waitFor(() => expect(result.current.canRefresh).toBe(true));
    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });

  it('쿨다운 중에는 refresh가 무시된다', async () => {
    const spy = vi.spyOn(api, 'getTrains').mockResolvedValue(response);
    const { result } = renderHook(() => useTrainData('9-8'));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    await act(async () => {
      result.current.refresh();
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.canRefresh).toBe(false);
  });

  it('역이 바뀌면 다시 조회한다', async () => {
    const spy = vi.spyOn(api, 'getTrains').mockResolvedValue(response);
    const { rerender } = renderHook(({ id }) => useTrainData(id), {
      initialProps: { id: '9-8' as string | null },
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    rerender({ id: '9-9' });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy).toHaveBeenLastCalledWith('9-9');
  });

  it('오류가 나면 error에 담는다', async () => {
    vi.spyOn(api, 'getTrains').mockRejectedValue(new ApiError('UPSTREAM_UNAVAILABLE', '실패'));
    const { result } = renderHook(() => useTrainData('9-8'));
    await waitFor(() => expect(result.current.error?.code).toBe('UPSTREAM_UNAVAILABLE'));
    expect(result.current.data).toBeNull();
  });

  it('오류 후 성공하면 error를 지운다', async () => {
    const spy = vi
      .spyOn(api, 'getTrains')
      .mockRejectedValueOnce(new ApiError('UPSTREAM_UNAVAILABLE', '실패'))
      .mockResolvedValue(response);
    const { result } = renderHook(() => useTrainData('9-8'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    await act(async () => {
      vi.advanceTimersByTime(3001);
    });
    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
```

`'자동으로 재조회하지 않는다'` 테스트는 폴링 금지 제약을 코드로 못박는 장치다. 나중에 누군가 무심코 `setInterval`을 넣으면 이 테스트가 잡아낸다.

- [ ] **Step 3: 테스트 실패 확인**

```bash
cd frontend && npm test
```

Expected: FAIL — `Failed to resolve import "./useSelectedStation"`

`useTrainData.test.ts`가 `vi.spyOn(api, 'getTrains')`로 실패한다면(`TypeError: Cannot redefine property`), 파일 맨 위에 다음 한 줄을 추가한다:

```ts
vi.mock('../api/subway', async (importOriginal) => ({ ...(await importOriginal<object>()) }));
```

Vitest는 보통 ESM export를 spy 가능하게 변환하지만 설정에 따라 막힐 수 있다. 이 한 줄이 모듈을 spy 가능한 형태로 다시 감싼다.

- [ ] **Step 4: useStations 구현**

`frontend/src/hooks/useStations.ts`:

```ts
import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { getStations } from '../api/subway';
import { Station } from '../types/subway';

export function useStations() {
  const [stations, setStations] = useState<Station[]>([]);
  const [lineName, setLineName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;

    getStations()
      .then((response) => {
        if (cancelled) return;
        setStations(response.stations);
        setLineName(response.lineName);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught : new ApiError('UNKNOWN', '역 목록을 불러오지 못했습니다.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { stations, lineName, loading, error };
}
```

- [ ] **Step 5: useSelectedStation 구현**

`frontend/src/hooks/useSelectedStation.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { Station } from '../types/subway';

export const STORAGE_KEY = 'subway-tracker:selected-station';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // 프라이빗 모드 등에서 접근이 막힐 수 있다.
  }
}

function writeStored(stationId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, stationId);
  } catch {
    // 저장 실패는 무시한다. 이번 세션 동안은 상태로 유지된다.
  }
}

export function useSelectedStation(stations: Station[]) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 역 목록은 비동기로 도착하므로, 목록이 채워진 뒤에 저장된 역을 복원한다.
  useEffect(() => {
    if (selectedId !== null || stations.length === 0) return;
    const stored = readStored();
    if (stored && stations.some((s) => s.stationId === stored)) {
      setSelectedId(stored);
    }
  }, [stations, selectedId]);

  const select = useCallback((stationId: string) => {
    setSelectedId(stationId);
    writeStored(stationId);
  }, []);

  const selected = stations.find((s) => s.stationId === selectedId) ?? null;

  return { selected, select };
}
```

- [ ] **Step 6: useTrainData 구현**

`frontend/src/hooks/useTrainData.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { getTrains } from '../api/subway';
import { TrainsResponse } from '../types/subway';

export const REFRESH_COOLDOWN_MS = 3000;

/**
 * 열차 데이터 조회를 감싼다. 조회 시점은 세 가지뿐이다 — 마운트, 역 변경, refresh().
 *
 * 자동 폴링은 의도적으로 없다. 개발키 호출 한도가 1000회/일이라
 * 15초 폴링이면 하루 약 4시간이면 소진된다(스펙 1절).
 * 폴링을 도입할 때는 이 훅 안에 setInterval을 넣으면 되고, 컴포넌트는 수정하지 않는다.
 */
export function useTrainData(stationId: string | null) {
  const [data, setData] = useState<TrainsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [canRefresh, setCanRefresh] = useState(true);

  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  const load = useCallback((id: string) => {
    const current = ++requestId.current;
    setLoading(true);
    setCanRefresh(false);

    getTrains(id)
      .then((response) => {
        if (current !== requestId.current) return; // 더 늦게 시작한 요청이 있으면 버린다
        setData(response);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (current !== requestId.current) return;
        setData(null);
        setError(
          caught instanceof ApiError ? caught : new ApiError('UNKNOWN', '열차 정보를 불러오지 못했습니다.'),
        );
      })
      .finally(() => {
        if (current !== requestId.current) return;
        setLoading(false);
        if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
        cooldownTimer.current = setTimeout(() => setCanRefresh(true), REFRESH_COOLDOWN_MS);
      });
  }, []);

  useEffect(() => {
    if (stationId === null) return;
    load(stationId);
  }, [stationId, load]);

  useEffect(
    () => () => {
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    },
    [],
  );

  const refresh = useCallback(() => {
    if (stationId === null || !canRefresh) return;
    load(stationId);
  }, [stationId, canRefresh, load]);

  return { data, loading, error, refresh, canRefresh };
}
```

- [ ] **Step 7: 테스트 통과 확인**

```bash
cd frontend && npm test
```

Expected: PASS — useSelectedStation 6 tests + useTrainData 8 tests + 기존 테스트

- [ ] **Step 8: 커밋**

```bash
git add frontend/src/hooks
git commit -m "feat(frontend): 역 목록·선택 유지·열차 조회 훅"
```

---

## Task 11: 트랙 표시 컴포넌트

**Files:**
- Create: `frontend/src/components/TrainMarker.tsx`
- Create: `frontend/src/components/LineTrack.tsx`
- Create: `frontend/src/components/DirectionPanel.tsx`
- Create: `frontend/src/components/DirectionPanel.css`
- Test: `frontend/src/components/DirectionPanel.test.tsx`

**Interfaces:**
- Consumes: Task 9의 `buildTrack`, `trainLeftPercent`, `formatRemaining`
- Produces: `<DirectionPanel stations={Station[]} selected={Station} block={DirectionBlock} />`
- Produces: `<LineTrack track={Station[]} trains={Train[]} selected={Station} />`
- Produces: `<TrainMarker train={Train} leftPercent={number} showExpressBadge={boolean} />`

- [ ] **Step 1: 실패 테스트 작성**

`frontend/src/components/DirectionPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DirectionBlock, Station, Train } from '../types/subway';
import { DirectionPanel } from './DirectionPanel';

const stations: Station[] = Array.from({ length: 38 }, (_, i) => ({
  stationId: `9-${i + 1}`,
  name: `역${i + 1}`,
  order: i + 1,
  isExpressStop: i + 1 === 10,
}));

const 증미 = stations[7];
const 염창 = stations[9];

function train(over: Partial<Train> = {}): Train {
  return {
    trainId: 'T1',
    trainType: 'LOCAL',
    currentStation: stations[8], // order 9
    remainingSeconds: 120,
    status: 'TRAVELING',
    positionRatio: 0.5,
    ...over,
  };
}

function block(trains: Train[]): DirectionBlock {
  return { directionId: 'UP', directionName: '개화 방면', trains };
}

describe('DirectionPanel', () => {
  it('방향 이름을 표시한다', () => {
    render(<DirectionPanel stations={stations} selected={증미} block={block([])} />);
    expect(screen.getByText('개화 방면')).toBeInTheDocument();
  });

  it('트랙에 역 5개를 표시하며 마지막이 선택한 역이다', () => {
    render(<DirectionPanel stations={stations} selected={증미} block={block([])} />);
    const names = screen.getAllByTestId('track-station').map((el) => el.textContent);
    expect(names).toEqual(['역12', '역11', '역10', '역9', '역8']);
  });

  it('열차가 없으면 안내 문구를 보여준다', () => {
    render(<DirectionPanel stations={stations} selected={증미} block={block([])} />);
    expect(screen.getByText('접근 중인 열차 없음')).toBeInTheDocument();
  });

  it('트랙 안의 열차를 점으로 표시하고 남은 시간을 붙인다', () => {
    render(<DirectionPanel stations={stations} selected={증미} block={block([train()])} />);
    const marker = screen.getByTestId('train-marker');
    expect(marker).toBeInTheDocument();
    expect(marker).toHaveTextContent('2분');
  });

  it('열차 점의 left 위치를 퍼센트로 지정한다', () => {
    render(<DirectionPanel stations={stations} selected={증미} block={block([train()])} />);
    expect(screen.getByTestId('train-marker')).toHaveStyle({ left: '87.5%' });
  });

  it('트랙 밖의 열차는 점 대신 텍스트로 안내한다', () => {
    const faraway = train({ currentStation: stations[20], remainingSeconds: 540 });
    render(<DirectionPanel stations={stations} selected={증미} block={block([faraway])} />);
    expect(screen.queryByTestId('train-marker')).not.toBeInTheDocument();
    expect(screen.getByText('다음 열차 9분')).toBeInTheDocument();
  });

  it('트랙 밖 열차가 있으면 "접근 중인 열차 없음" 문구를 띄우지 않는다', () => {
    const faraway = train({ currentStation: stations[20], remainingSeconds: 540 });
    render(<DirectionPanel stations={stations} selected={증미} block={block([faraway])} />);
    expect(screen.queryByText('접근 중인 열차 없음')).not.toBeInTheDocument();
  });

  it('급행 정차역에서는 급행 뱃지를 붙인다', () => {
    const express = train({ trainType: 'EXPRESS', currentStation: stations[11] });
    render(<DirectionPanel stations={stations} selected={염창} block={block([express])} />);
    expect(screen.getByText('급행')).toBeInTheDocument();
  });

  it('일반 열차에는 급행 뱃지를 붙이지 않는다', () => {
    render(<DirectionPanel stations={stations} selected={증미} block={block([train()])} />);
    expect(screen.queryByText('급행')).not.toBeInTheDocument();
  });

  it('도착 시간을 모르는 열차는 대시로 표시한다', () => {
    render(<DirectionPanel stations={stations} selected={증미} block={block([train({ remainingSeconds: null })])} />);
    expect(screen.getByTestId('train-marker')).toHaveTextContent('—');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd frontend && npm test
```

Expected: FAIL — `Failed to resolve import "./DirectionPanel"`

- [ ] **Step 3: TrainMarker 구현**

`frontend/src/components/TrainMarker.tsx`:

```tsx
import { Train } from '../types/subway';
import { formatRemaining } from '../utils/trackPosition';

type Props = {
  train: Train;
  leftPercent: number;
  showExpressBadge: boolean;
};

export function TrainMarker({ train, leftPercent, showExpressBadge }: Props) {
  return (
    <div className="train-marker" data-testid="train-marker" style={{ left: `${leftPercent}%` }}>
      <span className="train-marker__dot" aria-hidden="true" />
      <span className="train-marker__time">{formatRemaining(train.remainingSeconds)}</span>
      {showExpressBadge && <span className="train-marker__badge">급행</span>}
    </div>
  );
}
```

- [ ] **Step 4: LineTrack 구현**

`frontend/src/components/LineTrack.tsx`:

```tsx
import { Station, Train } from '../types/subway';
import { trainLeftPercent } from '../utils/trackPosition';
import { TrainMarker } from './TrainMarker';

type Props = {
  track: Station[];
  trains: Train[];
  selected: Station;
};

export function LineTrack({ track, trains, selected }: Props) {
  return (
    <div className="line-track">
      <div className="line-track__rail" aria-hidden="true" />

      <div className="line-track__stations">
        {track.map((station) => (
          <span
            key={station.stationId}
            className={
              station.stationId === selected.stationId
                ? 'line-track__station line-track__station--selected'
                : 'line-track__station'
            }
            data-testid="track-station"
          >
            {station.name}
          </span>
        ))}
      </div>

      <div className="line-track__trains">
        {trains.map((train) => {
          const left = trainLeftPercent(track, train);
          if (left === null) return null;
          return (
            <TrainMarker
              key={train.trainId}
              train={train}
              leftPercent={left}
              showExpressBadge={train.trainType === 'EXPRESS'}
            />
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: DirectionPanel 구현**

`frontend/src/components/DirectionPanel.tsx`:

```tsx
import { DirectionBlock, Station } from '../types/subway';
import { buildTrack, formatRemaining, trainLeftPercent } from '../utils/trackPosition';
import { LineTrack } from './LineTrack';
import './DirectionPanel.css';

type Props = {
  stations: Station[];
  selected: Station;
  block: DirectionBlock;
};

export function DirectionPanel({ stations, selected, block }: Props) {
  const track = buildTrack(stations, selected, block.directionId);

  const onTrack = block.trains.filter((train) => trainLeftPercent(track, train) !== null);
  const offTrack = block.trains.filter((train) => trainLeftPercent(track, train) === null);
  const nextOffTrack = offTrack[0];

  return (
    <section className="direction-panel">
      <h2 className="direction-panel__title">{block.directionName}</h2>

      <LineTrack track={track} trains={onTrack} selected={selected} />

      {block.trains.length === 0 && (
        <p className="direction-panel__empty">접근 중인 열차 없음</p>
      )}

      {nextOffTrack && (
        <p className="direction-panel__next">
          다음 열차 {formatRemaining(nextOffTrack.remainingSeconds)}
        </p>
      )}
    </section>
  );
}
```

`onTrack`이 비어 있어도 `block.trains`가 비어 있지 않으면 "접근 중인 열차 없음"을 띄우지 않는다. 열차가 멀리 있는 것과 아예 없는 것은 사용자에게 다른 정보다.

- [ ] **Step 6: 스타일 작성**

`frontend/src/components/DirectionPanel.css`:

```css
.direction-panel {
  padding: 1rem 0.75rem 1.25rem;
  border-bottom: 1px solid #e5e5e5;
}

.direction-panel__title {
  margin: 0 0 1.5rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #444;
}

.direction-panel__empty,
.direction-panel__next {
  margin: 0.75rem 0 0;
  font-size: 0.85rem;
  color: #888;
}

.line-track {
  position: relative;
  height: 3.5rem;
}

.line-track__rail {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: #ccc;
}

.line-track__stations {
  display: flex;
  justify-content: space-between;
  padding-top: 0.6rem;
}

.line-track__station {
  font-size: 0.7rem;
  color: #999;
  white-space: nowrap;
}

.line-track__station--selected {
  color: #1a1a1a;
  font-weight: 700;
}

.line-track__trains {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.train-marker {
  position: absolute;
  top: -0.35rem;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: left 0.4s ease-out;
}

.train-marker__dot {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  background: #c8102e;
}

.train-marker__time {
  margin-top: 1.6rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: #c8102e;
  white-space: nowrap;
}

.train-marker__badge {
  margin-top: 0.15rem;
  padding: 0 0.25rem;
  font-size: 0.6rem;
  color: #fff;
  background: #c8102e;
  border-radius: 0.2rem;
}
```

역 이름이 트랙 아래쪽에, 열차 시간이 그 위에 겹치지 않게 배치하기 위해 `train-marker__time`에 `margin-top`으로 여백을 준다. 트랙 높이가 고정이라 두 층이 안정적으로 분리된다.

- [ ] **Step 7: 테스트 통과 확인**

```bash
cd frontend && npm test
```

Expected: PASS — DirectionPanel 10 tests + 기존 테스트

- [ ] **Step 8: 커밋**

```bash
git add frontend/src/components
git commit -m "feat(frontend): 방향별 트랙과 열차 표시 컴포넌트"
```

---

## Task 12: 앱 셸 조립 — 역 선택, 새로고침, 상태 표시

**Files:**
- Create: `frontend/src/components/StationSelector.tsx`
- Create: `frontend/src/components/RefreshBar.tsx`
- Create: `frontend/src/components/states/StatusViews.tsx`
- Create: `frontend/src/utils/relativeTime.ts`
- Modify: `frontend/src/App.tsx`, `frontend/src/App.css`, `frontend/src/main.tsx`, `frontend/index.html`
- Delete: `frontend/src/assets/react.svg`
- Test: `frontend/src/App.test.tsx`, `frontend/src/utils/relativeTime.test.ts`

**Interfaces:**
- Consumes: Task 10의 훅 3종, Task 11의 `DirectionPanel`
- Produces: `<StationSelector stations={Station[]} selected={Station | null} onSelect={(id: string) => void} />`
- Produces: `<RefreshBar updatedAt={string | null} loading={boolean} canRefresh={boolean} onRefresh={() => void} />`
- Produces: `formatRelativeTime(iso: string, now: number): string`
- Produces: `<LoadingView />`, `<ErrorView error={ApiError} onRetry={() => void} />`, `<StaleBanner updatedAt={string} />`

- [ ] **Step 1: relativeTime 실패 테스트 작성**

`frontend/src/utils/relativeTime.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './relativeTime';

const base = new Date('2026-07-22T14:00:00+09:00').getTime();

describe('formatRelativeTime', () => {
  it('방금 전은 방금으로 표시한다', () => {
    expect(formatRelativeTime('2026-07-22T14:00:00+09:00', base + 2_000)).toBe('방금');
  });

  it('1분 미만은 초로 표시한다', () => {
    expect(formatRelativeTime('2026-07-22T14:00:00+09:00', base + 42_000)).toBe('42초 전');
  });

  it('1분 이상은 분으로 표시한다', () => {
    expect(formatRelativeTime('2026-07-22T14:00:00+09:00', base + 125_000)).toBe('2분 전');
  });

  it('1시간 이상은 시간으로 표시한다', () => {
    expect(formatRelativeTime('2026-07-22T14:00:00+09:00', base + 7_500_000)).toBe('2시간 전');
  });

  it('잘못된 시각 문자열은 빈 문자열을 반환한다', () => {
    expect(formatRelativeTime('not-a-date', base)).toBe('');
  });
});
```

- [ ] **Step 2: App 통합 실패 테스트 작성**

`frontend/src/App.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { ApiError } from './api/client';
import * as api from './api/subway';
import { STORAGE_KEY } from './hooks/useSelectedStation';
import { Station, StationsResponse, TrainsResponse } from './types/subway';

const stations: Station[] = [
  { stationId: '9-7', name: '가양', order: 7, isExpressStop: true },
  { stationId: '9-8', name: '증미', order: 8, isExpressStop: false },
  { stationId: '9-9', name: '등촌', order: 9, isExpressStop: false },
];

const stationsResponse: StationsResponse = {
  lineId: '9',
  lineName: '서울 지하철 9호선',
  stations,
};

function trainsResponse(over: Partial<TrainsResponse> = {}): TrainsResponse {
  return {
    line: { id: '9', name: '서울 지하철 9호선' },
    station: stations[1],
    directions: [
      {
        directionId: 'UP',
        directionName: '개화 방면',
        trains: [
          {
            trainId: '9134',
            trainType: 'LOCAL',
            currentStation: stations[2],
            remainingSeconds: 120,
            status: 'TRAVELING',
            positionRatio: 0.5,
          },
        ],
      },
      { directionId: 'DOWN', directionName: '중앙보훈병원 방면', trains: [] },
    ],
    updatedAt: new Date().toISOString(),
    stale: false,
    ...over,
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('App', () => {
  it('역 목록을 불러오는 동안 로딩을 표시한다', () => {
    vi.spyOn(api, 'getStations').mockReturnValue(new Promise(() => {}));
    render(<App />);
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
  });

  it('저장된 역이 없으면 역을 고르라고 안내한다', async () => {
    vi.spyOn(api, 'getStations').mockResolvedValue(stationsResponse);
    const trainsSpy = vi.spyOn(api, 'getTrains');
    render(<App />);
    await waitFor(() => expect(screen.getByText('역을 선택하세요')).toBeInTheDocument());
    expect(trainsSpy).not.toHaveBeenCalled();
  });

  it('역을 선택하면 양방향 열차 정보를 보여준다', async () => {
    vi.spyOn(api, 'getStations').mockResolvedValue(stationsResponse);
    vi.spyOn(api, 'getTrains').mockResolvedValue(trainsResponse());
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('역')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('역'), '9-8');

    await waitFor(() => expect(screen.getByText('개화 방면')).toBeInTheDocument());
    expect(screen.getByText('중앙보훈병원 방면')).toBeInTheDocument();
    expect(screen.getByTestId('train-marker')).toHaveTextContent('2분');
  });

  it('선택한 역을 localStorage에 저장한다', async () => {
    vi.spyOn(api, 'getStations').mockResolvedValue(stationsResponse);
    vi.spyOn(api, 'getTrains').mockResolvedValue(trainsResponse());
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('역')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('역'), '9-8');

    expect(localStorage.getItem(STORAGE_KEY)).toBe('9-8');
  });

  it('저장된 역이 있으면 바로 조회한다', async () => {
    localStorage.setItem(STORAGE_KEY, '9-8');
    vi.spyOn(api, 'getStations').mockResolvedValue(stationsResponse);
    const trainsSpy = vi.spyOn(api, 'getTrains').mockResolvedValue(trainsResponse());
    render(<App />);
    await waitFor(() => expect(trainsSpy).toHaveBeenCalledWith('9-8'));
    expect(await screen.findByText('개화 방면')).toBeInTheDocument();
  });

  it('stale 응답이면 배너를 보여준다', async () => {
    localStorage.setItem(STORAGE_KEY, '9-8');
    vi.spyOn(api, 'getStations').mockResolvedValue(stationsResponse);
    vi.spyOn(api, 'getTrains').mockResolvedValue(trainsResponse({ stale: true }));
    render(<App />);
    expect(await screen.findByText(/갱신 실패/)).toBeInTheDocument();
  });

  it('열차 조회가 실패하면 오류와 재시도 버튼을 보여준다', async () => {
    localStorage.setItem(STORAGE_KEY, '9-8');
    vi.spyOn(api, 'getStations').mockResolvedValue(stationsResponse);
    vi.spyOn(api, 'getTrains').mockRejectedValue(
      new ApiError('UPSTREAM_UNAVAILABLE', '실시간 지하철 정보를 가져오지 못했습니다.'),
    );
    render(<App />);
    expect(await screen.findByText('실시간 지하철 정보를 가져오지 못했습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('역 목록 조회가 실패하면 오류를 보여준다', async () => {
    vi.spyOn(api, 'getStations').mockRejectedValue(new ApiError('NETWORK_ERROR', '서버에 연결하지 못했습니다.'));
    render(<App />);
    expect(await screen.findByText('서버에 연결하지 못했습니다.')).toBeInTheDocument();
  });

  it('새로고침 버튼은 쿨다운 동안 비활성화된다', async () => {
    localStorage.setItem(STORAGE_KEY, '9-8');
    vi.spyOn(api, 'getStations').mockResolvedValue(stationsResponse);
    vi.spyOn(api, 'getTrains').mockResolvedValue(trainsResponse());
    render(<App />);
    const button = await screen.findByRole('button', { name: '새로고침' });
    await waitFor(() => expect(button).toBeDisabled());
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
cd frontend && npm test
```

Expected: FAIL — `formatRelativeTime` 미존재, App이 기본 Vite 화면이라 문구 불일치

- [ ] **Step 4: relativeTime 구현**

`frontend/src/utils/relativeTime.ts`:

```ts
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return '';

  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return '방금';
  if (seconds < 60) return `${seconds}초 전`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  return `${Math.floor(seconds / 3600)}시간 전`;
}
```

- [ ] **Step 5: 상태 컴포넌트 구현**

`frontend/src/components/states/StatusViews.tsx`:

```tsx
import { ApiError } from '../../api/client';
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
```

- [ ] **Step 6: StationSelector와 RefreshBar 구현**

`frontend/src/components/StationSelector.tsx`:

```tsx
import { Station } from '../types/subway';

type Props = {
  stations: Station[];
  selected: Station | null;
  onSelect: (stationId: string) => void;
};

export function StationSelector({ stations, selected, onSelect }: Props) {
  return (
    <div className="station-selector">
      <label htmlFor="station-select">역</label>
      <select
        id="station-select"
        value={selected?.stationId ?? ''}
        onChange={(event) => onSelect(event.target.value)}
      >
        <option value="" disabled>
          역을 선택하세요
        </option>
        {stations.map((station) => (
          <option key={station.stationId} value={station.stationId}>
            {station.name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

`frontend/src/components/RefreshBar.tsx`:

```tsx
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
```

버튼의 접근 가능한 이름이 항상 `새로고침`이어야 테스트가 로딩 중에도 버튼을 찾을 수 있다. 로딩 표시는 텍스트 교체가 아니라 `disabled` 상태로 나타낸다.

- [ ] **Step 7: App 조립**

`frontend/src/App.tsx`:

```tsx
import { DirectionPanel } from './components/DirectionPanel';
import { RefreshBar } from './components/RefreshBar';
import { StationSelector } from './components/StationSelector';
import { ErrorView, LoadingView, StaleBanner } from './components/states/StatusViews';
import { useSelectedStation } from './hooks/useSelectedStation';
import { useStations } from './hooks/useStations';
import { useTrainData } from './hooks/useTrainData';
import './App.css';

export default function App() {
  const { stations, loading: stationsLoading, error: stationsError } = useStations();
  const { selected, select } = useSelectedStation(stations);
  const { data, loading, error, refresh, canRefresh } = useTrainData(selected?.stationId ?? null);

  if (stationsLoading) {
    return (
      <main className="app">
        <LoadingView />
      </main>
    );
  }

  if (stationsError) {
    return (
      <main className="app">
        <ErrorView error={stationsError} />
      </main>
    );
  }

  return (
    <main className="app">
      <StationSelector stations={stations} selected={selected} onSelect={select} />

      {!selected && <p className="status">역을 선택하세요</p>}

      {selected && data?.stale && <StaleBanner updatedAt={data.updatedAt} />}

      {selected && error && <ErrorView error={error} onRetry={refresh} />}

      {selected && !error && !data && loading && <LoadingView />}

      {selected && !error && data && (
        <div className="app__directions">
          {data.directions.map((block) => (
            <DirectionPanel
              key={block.directionId}
              stations={stations}
              selected={selected}
              block={block}
            />
          ))}
        </div>
      )}

      {selected && (
        <RefreshBar
          updatedAt={data?.updatedAt ?? null}
          loading={loading}
          canRefresh={canRefresh}
          onRefresh={refresh}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 8: 스타일과 진입점 정리**

`frontend/src/App.css` 전체를 교체한다:

```css
:root {
  font-family: system-ui, -apple-system, 'Segoe UI', 'Malgun Gothic', sans-serif;
  color: #1a1a1a;
  background: #fff;
}

body {
  margin: 0;
}

.app {
  max-width: 480px;
  margin: 0 auto;
  padding: 1rem 0.5rem 2rem;
}

.station-selector {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 0.75rem 1rem;
}

.station-selector label {
  font-size: 0.9rem;
  color: #666;
}

.station-selector select {
  flex: 1;
  padding: 0.6rem 0.5rem;
  font-size: 1rem;
  border: 1px solid #ccc;
  border-radius: 0.4rem;
  background: #fff;
}

.status {
  padding: 1.5rem 0.75rem;
  text-align: center;
  color: #888;
  font-size: 0.9rem;
}

.status--error {
  color: #c8102e;
}

.status--error button,
.refresh-bar button {
  margin-top: 0.75rem;
  padding: 0.5rem 1.25rem;
  font-size: 0.9rem;
  border: 1px solid #ccc;
  border-radius: 0.4rem;
  background: #fff;
  cursor: pointer;
}

.status--error button:disabled,
.refresh-bar button:disabled {
  opacity: 0.5;
  cursor: default;
}

.status--stale {
  margin: 0 0.75rem 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #fff6e0;
  border-radius: 0.4rem;
  color: #8a6d00;
  font-size: 0.8rem;
  text-align: left;
}

.refresh-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 0.75rem 0;
}

.refresh-bar__time {
  font-size: 0.8rem;
  color: #888;
}

.refresh-bar button {
  margin-top: 0;
}
```

`frontend/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`frontend/src/index.css`를 삭제하고(`main.tsx`에서 import를 제거했다), `frontend/index.html`의 `<title>`을 `9호선 열차 위치`로, `<html lang>`을 `ko`로 바꾼다. `<head>`에 뷰포트 메타가 없다면 추가한다:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

`frontend/src/assets/react.svg`와 `frontend/public/vite.svg`를 삭제한다.

- [ ] **Step 9: 테스트 통과 확인**

```bash
cd frontend && npm test
```

Expected: PASS — 전체 테스트

- [ ] **Step 10: 로컬 수동 확인**

백엔드와 프론트엔드를 동시에 띄운다.

```bash
# 터미널 1
cd backend && npm run start:dev

# 터미널 2
cd frontend && npm run dev
```

브라우저에서 `http://localhost:5173`을 연다. API 키가 없으므로 열차 조회는 실패하고 오류 화면이 뜨는 것이 정상이다. 확인할 것:

- 역 목록 드롭다운에 38개 역이 보인다
- 역을 선택하면 오류 메시지와 "다시 시도" 버튼이 뜬다
- 새로고침하면 선택한 역이 유지된다
- 브라우저 개발자도구를 모바일 세로(예: iPhone SE)로 놓아도 레이아웃이 깨지지 않는다

- [ ] **Step 11: 커밋**

```bash
cd C:/dev/metro
git add frontend
git commit -m "feat(frontend): 앱 셸 조립과 상태 표시"
```

---

## Task 13: Docker 구성 + 로컬 전체 구동

**Files:**
- Create: `backend/Dockerfile`, `backend/.dockerignore`
- Create: `frontend/Dockerfile`, `frontend/.dockerignore`, `frontend/nginx.conf`
- Create: `docker-compose.yml`, `.env.example`
- Create: `README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Task 1~12의 백엔드·프론트엔드 전체
- Produces: `docker compose up`으로 `http://localhost` 에서 동작하는 서비스

- [ ] **Step 1: .dockerignore 작성**

`backend/.dockerignore`와 `frontend/.dockerignore` 둘 다 동일한 내용으로:

```
node_modules
dist
.env
*.log
```

`.env`를 반드시 넣는다. 이게 없으면 API 키가 이미지 레이어에 구워져 이미지를 공유하는 순간 유출된다.

- [ ] **Step 2: 백엔드 Dockerfile 작성**

`backend/Dockerfile`:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

`line9.json`은 `resolveJsonModule`로 import되므로 `dist`에 함께 번들된다. 빌드 후 `dist/lines/data/line9.json`이 있는지 Step 7에서 확인한다.

- [ ] **Step 3: 프론트엔드 Dockerfile과 nginx 설정 작성**

nginx 설정은 `frontend/nginx.conf`에 둔다. 스펙 9절은 `nginx/nginx.conf`로 적었지만, 별도 디렉토리에 두면 Docker 빌드 컨텍스트가 프론트엔드 밖으로 나가야 해서 빌드킷 버전에 따라 동작이 갈린다. 설정 파일은 프론트엔드 이미지에만 들어가므로 같이 두는 편이 단순하다.

`frontend/Dockerfile`:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`frontend/nginx.conf`:

```nginx
server {
    listen 80;
    server_name _;

    gzip on;
    gzip_types text/css application/javascript application/json;
    gzip_min_length 1024;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
    }
}
```

`try_files ... /index.html`이 SPA 라우팅을 처리한다. `/api/`의 타임아웃을 짧게 잡은 이유는 서울시 API가 느릴 때 nginx가 오래 붙잡고 있는 것보다 502를 빨리 돌려주는 편이 낫기 때문이다 — 백엔드에 stale 데이터가 있으면 그쪽이 먼저 응답한다.

- [ ] **Step 4: docker-compose 작성**

`docker-compose.yml`:

```yaml
services:
  backend:
    build: ./backend
    env_file: .env
    environment:
      NODE_ENV: production
      PORT: 3000
    restart: unless-stopped
    expose:
      - "3000"

  web:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped
```

`backend`에 `ports`가 아니라 `expose`를 쓴 것이 중요하다. 백엔드는 내부 네트워크에서만 닿을 수 있고, 외부에는 nginx의 80만 열린다.

- [ ] **Step 5: 루트 .env.example과 .gitignore 갱신**

`C:/dev/metro/.env.example`:

```env
SEOUL_OPEN_API_KEY=
SEOUL_SUBWAY_REALTIME_BASE_URL=http://swopenapi.seoul.go.kr/api/subway

SUBWAY_CACHE_TTL_MS=10000
SUBWAY_STALE_MAX_AGE_MS=300000

DOMAIN=subway.example.com
```

`.gitignore`에 다음이 포함되어 있는지 확인하고 없으면 추가한다:

```
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
```

- [ ] **Step 6: README 작성**

`C:/dev/metro/README.md`:

````markdown
# 9호선 열차 위치 확인

선택한 9호선 역으로 다가오는 양방향 열차의 위치와 도착 예정 시간을 보여주는 개인용 웹 서비스.

- 설계: `docs/superpowers/specs/2026-07-22-subway-tracker-design.md`
- 구현 계획: `docs/superpowers/plans/2026-07-22-subway-tracker-mvp.md`

## 준비

서울 열린데이터광장에서 실시간 지하철 API 키를 발급받는다.

```bash
cp .env.example .env
# .env의 SEOUL_OPEN_API_KEY를 채운다
```

## 개발

```bash
cd backend && cp ../.env .env && npm install && npm run start:dev   # :3000
cd frontend && npm install && npm run dev                           # :5173
```

Vite 개발 서버가 `/api`를 백엔드로 프록시한다.

## 테스트

```bash
cd backend && npx jest && npx jest --config test/jest-e2e.json
cd frontend && npm test
```

## Docker로 실행

```bash
docker compose up --build
```

`http://localhost` 접속.

## 알아둘 것

- **자동 갱신이 없다.** 개발키 호출 한도가 1000회/일이라 15초 폴링이면 하루 4시간이면 소진된다. 새로고침 버튼으로 직접 갱신한다.
- 증미역처럼 급행이 서지 않는 역에서는 급행 열차가 목록에서 제외된다.
- 서울시 API 응답 필드는 아직 실제로 검증되지 않았다. 설계 문서 2절의 검증 항목을 참고한다.

## 라즈베리파이 배포 (미실행)

- 64비트 Raspberry Pi OS 필요. `node:20-alpine`, `nginx:alpine` 모두 arm64를 지원한다.
- **RAM 2GB 이하에서는 Vite 빌드가 메모리 부족으로 실패할 수 있다.** 스왑을 늘리거나 PC에서 `docker buildx --platform linux/arm64`로 빌드해 이미지를 옮긴다.
- HTTPS는 도메인 연결 후 certbot으로 적용하며 외부에는 80·443만 노출한다.
````

- [ ] **Step 7: 빌드 확인**

```bash
cd C:/dev/metro
cp .env.example .env
# .env의 SEOUL_OPEN_API_KEY에 임의 문자열 입력 (실호출은 실패하지만 기동은 확인된다)
docker compose build
```

Expected: 두 이미지 모두 빌드 성공

백엔드 이미지에 정적 데이터가 포함됐는지 확인한다:

```bash
docker compose run --rm --entrypoint sh backend -c "ls dist/lines/data/"
```

Expected: `line9.json` 출력. 없다면 `backend/nest-cli.json`의 `compilerOptions`에 다음을 추가하고 다시 빌드한다:

```json
{
  "compilerOptions": {
    "assets": [{ "include": "lines/data/*.json", "outDir": "dist" }],
    "watchAssets": true
  }
}
```

- [ ] **Step 8: 전체 구동 확인**

```bash
docker compose up -d
curl http://localhost/api/lines/9/stations
```

Expected: 38개 역 JSON

브라우저에서 `http://localhost`를 열고 확인한다:

- 역 드롭다운이 채워진다
- 역을 선택하면 (키가 유효하지 않으므로) 오류 화면이 뜬다
- 새로고침해도 선택한 역이 유지된다

```bash
docker compose logs backend | grep "서울시 API 호출"
```

Expected: 호출 로그가 보인다 — 호출 카운터가 동작하는 증거다.

```bash
docker compose down
```

- [ ] **Step 9: 커밋**

```bash
git add -A
git commit -m "feat: Docker 구성과 nginx 리버스 프록시"
```

---

## 완료 조건

이 계획을 모두 마치면 다음이 성립해야 한다.

- [ ] `cd backend && npx jest` 전부 통과
- [ ] `cd backend && npx jest --config test/jest-e2e.json` 전부 통과
- [ ] `cd frontend && npm test` 전부 통과
- [ ] `docker compose up` 후 `http://localhost`에서 역 선택 UI가 동작한다
- [ ] 백엔드 포트가 외부로 열려 있지 않다 (`docker compose ps`에서 `backend`에 포트 매핑이 없다)
- [ ] `.env`가 git에 추적되지 않는다 (`git status --ignored | grep .env`)

## API 키 발급 후 할 일

이 계획의 범위 밖이지만, 키가 나오면 순서대로 진행한다.

1. `.env`의 `SEOUL_OPEN_API_KEY`를 채우고 증미역을 실제로 조회한다.
2. 실제 응답을 `backend/test/fixtures/station-arrival.success.json`에 덮어쓴다.
3. `npx jest src/seoul-api` 실행 — 깨지는 테스트가 스펙 2절에서 잘못 추측한 항목이다.
4. 매퍼를 실제 응답에 맞게 고친다.
5. `docker compose logs backend | grep "서울시 API 호출"`로 하루 실제 호출량을 관찰한다.
6. 여유가 있으면 `useTrainData`에 `setInterval`을 넣어 폴링을 켠다.
