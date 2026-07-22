# 지하철 실시간 위치 시각화 서비스 — MVP 설계

작성일: 2026-07-22
원본 요구사항: `subway_tracker_design_prompt.md`

---

## 1. 개요

선택한 역으로 다가오는 양방향 열차의 현재 위치와 도착 예정 시간을 단순한 선 형태로 보여주는 개인용 웹 서비스.

서울 지하철 9호선만 지원하며, 증미역을 주요 테스트 역으로 사용한다. 이번 구현의 끝점은 **로컬 동작 + Docker 구성 완료**까지이며, 라즈베리파이 배포와 HTTPS 연결은 절차만 문서로 남기고 실행하지 않는다.

### 원본 요구사항에서 변경한 사항

설계 과정에서 의도적으로 변경한 항목이다. 원본 문서와 충돌하므로 명시해 둔다.

| 항목 | 원본 | 변경 | 이유 |
|---|---|---|---|
| 데이터 갱신 | 필수기능 7 / 성공기준 6 — 일정 주기 자동 폴링 | **수동 새로고침** | 개발키 1000회/일 제한. 15초 폴링은 하루 약 4시간이면 소진된다. |
| 급행 구분 | 언급 없음 | **표시 추가 (필터링은 하지 않음)** | 도착정보 API는 조회한 역에 서지 않는 급행을 이미 내려주지 않는다(가양 vs 증미로 실측 확인). `isExpressStop`은 공식 자료로 대조되지 않은 값이라 이를 근거로 다시 필터링하면, 값이 틀렸을 때 실제로 오는 급행을 조용히 삭제하는 위험만 남는다. |
| 역 선택 유지 | 사용자별 데이터 저장 없음 (59줄) | **localStorage에 마지막 역 저장** | 서버 저장도 계정도 아니며, 폴링이 없어진 만큼 매번 역을 고르는 부담을 없앤다. |
| 백엔드 모듈 | `subway/` 단일 모듈 (10장) | **`lines` / `trains` 분리** | 정적 데이터와 실시간 데이터는 캐시 정책과 변경 주기가 다르다. |

폴링은 정식키 발급 또는 서울 열린데이터 활용사례 등록(원본 599줄) 이후 재검토한다.

---

## 2. 검증이 필요한 항목

API 키가 아직 없어 확인하지 못한 항목이다. **추측한 값에 의존하는 코드는 순수 함수로 격리**하고 픽스처 기반으로 테스트한다. 키 발급 후 픽스처를 실제 응답으로 교체하면, 그때 깨지는 테스트가 곧 잘못 추측한 지점의 목록이 된다.

1. 도착정보 API의 정확한 필드명 및 급행 표기 방식
2. 현재 위치를 나타내는 역명 문자열의 실제 포맷 (역명만인지, 접미사가 붙는지)
3. 방향별로 반환되는 열차 수
4. 일 호출 한도의 정확한 값과 초과 시 응답 형태
5. 9호선 역 ID 체계 — 원본 문서의 `0922`, `order: 10`은 예시일 뿐이며 실제 값 확인 필요
6. 9호선 급행 정차역 목록 — 정적 JSON에 직접 작성하며 공식 자료로 대조 필요

---

## 3. 외부 API 선택

서울 열린데이터광장의 **역 도착정보 API 단독** 사용. 노선 위치 API는 쓰지 않는다.

역 하나를 조회하면 도착예정시간(초), 현재 위치 역명, 급행 여부, 상·하행이 한 번의 호출로 모두 나온다. 노선 위치 API는 열차 위치는 정확하지만 **도착예정시간을 제공하지 않아** 역간 소요시간 테이블로 추정해야 하고, 급행 때문에 그 추정이 더 어긋난다. 두 API를 병합하는 방식은 가장 정확하지만 호출이 2배로 늘고 열차번호 매칭 로직이 필요해 원본 626~635줄의 단순성 원칙에 어긋난다.

도착정보 API의 열차 상태 구분(진입·도착·출발·전역출발)은 원본 477~483줄의 위치 단순화와 거의 1:1로 대응한다.

백엔드가 외부 형식을 완전히 감추므로, 나중에 노선 위치 API를 더해도 프론트엔드는 수정되지 않는다.

---

## 4. 시스템 구성

```
브라우저
  │ ① GET /api/lines/9/stations              (최초 1회)
  │ ② GET /api/lines/9/stations/{id}/trains  (앱 진입 · 역 선택 · 새로고침 시)
  ▼
nginx (:80)
  ├── / ......... React 정적 파일
  └── /api/ ..... proxy → backend:3000
                     │ 캐시 히트(TTL 10초)? → 즉시 응답
                     │ 미스 → 서울시 API 1회 호출 → 변환 → 캐시 저장
                     ▼
                서울시 OpenAPI
```

백엔드 포트는 외부에 공개하지 않는다. nginx만 노출되므로 API 키를 쥔 프로세스가 인터넷에 직접 닿지 않는다.

---

## 5. 사용자 흐름

1. 앱 진입 → 역 목록 조회 → localStorage에 저장된 역이 있으면 그 역의 열차 정보를 자동 조회
2. 저장된 역이 없거나 유효하지 않으면 역 선택 상태로 시작
3. 역 선택 → 즉시 조회 + localStorage에 저장
4. 새로고침 버튼 → 재조회 (3초 쿨다운)

조회 시점은 이 셋뿐이다. 자동 갱신은 없다.

---

## 6. 백엔드

### 6.1 모듈 구조

```
backend/src/
├── main.ts
├── app.module.ts
├── config/
│   └── configuration.ts        환경변수 로딩·검증
├── lines/                      정적 노선 데이터
│   ├── lines.module.ts
│   ├── lines.controller.ts     GET /api/lines/:lineId/stations
│   ├── lines.service.ts        역 목록·조회, 급행 정차 판정, 역명→역 매핑
│   └── data/line9.json
├── trains/                     실시간 열차
│   ├── trains.module.ts
│   ├── trains.controller.ts    GET /api/lines/:lineId/stations/:stationId/trains
│   ├── trains.service.ts       방향 분류, 캐시 조율, stale 처리 (급행 필터링 없음 — 상류가 이미 처리)
│   ├── train-position.ts       상태 → positionRatio          ★순수함수
│   └── dto/
├── seoul-api/                  외부 API 경계
│   ├── seoul-api.module.ts
│   ├── seoul-api.client.ts     HTTP 호출 + 호출 횟수 카운트
│   └── seoul-api.mapper.ts     원본 응답 → 내부 도메인       ★순수함수
└── common/
    ├── cache.service.ts        인메모리 TTL 캐시 + stale 보관
    └── filters/                예외 → 표준 오류 응답
```

★ 표시한 두 순수 함수가 이 설계의 중심이다. 외부 호출 없이 변환 로직과 위치 계산을 전부 테스트할 수 있으며, 이것이 API 키 없이 개발을 진행할 수 있는 근거다.

`seoul-api.client.ts`는 외부 API 호출 횟수를 인메모리로 누적해 로그에 남긴다. 화면에는 노출하지 않는다. 하루에 실제로 몇 회를 쓰는지 알아야 폴링을 언제 켤지, 정식키를 신청할지 판단할 수 있다.

### 6.2 내부 API 명세

**역 목록**

```http
GET /api/lines/9/stations
```

```jsonc
{
  "lineId": "9",
  "lineName": "서울 지하철 9호선",
  "stations": [
    { "stationId": "...", "name": "증미", "order": 8, "isExpressStop": false }
  ]
}
```

**역 기준 열차 상황**

```http
GET /api/lines/9/stations/{stationId}/trains
```

```jsonc
{
  "line":    { "id": "9", "name": "서울 지하철 9호선" },
  "station": { "id": "...", "name": "증미", "order": 8, "isExpressStop": false },
  "directions": [
    {
      "directionId": "UP",
      "directionName": "개화 방면",
      "trains": [
        {
          "trainId": "9134",
          "trainType": "LOCAL",              // EXPRESS | LOCAL
          "currentStation": { "id": "...", "name": "등촌", "order": 9 },
          "remainingSeconds": 125,
          "status": "APPROACHING",
          "positionRatio": 0.75
        }
      ]
    },
    { "directionId": "DOWN", "directionName": "중앙보훈병원 방면", "trains": [] }
  ],
  "updatedAt": "2026-07-22T14:00:00+09:00",
  "stale": false
}
```

`directionId`는 `UP`(개화 방면, order 감소) / `DOWN`(중앙보훈병원 방면, order 증가)이다.

**급행 필터링**: 백엔드는 급행 열차를 걸러내지 않는다. 도착정보 API는 조회한 역에 서지 않는 급행을 애초에 응답에 포함시키지 않으므로(증미역 0건 vs 가양역 2건으로 실측 확인), 추가 필터링은 불필요하다. `trainType`은 모든 열차에 그대로 남겨 응답에 포함하며, 급행이 실제로 정차하는 역에서는 프론트엔드가 이를 뱃지로 표시한다.

**`stale` 플래그**: 서울시 API 호출이 실패해도 마지막 성공 데이터가 5분 이내면 그 데이터를 `stale: true`, `updatedAt`은 성공 시각으로 하여 200으로 반환한다. 원본 16장의 "마지막 정상 데이터와 마지막 갱신 시간을 유지"를 이것으로 충족한다. 프론트엔드는 별도 오류 분기 없이 배너만 띄우면 된다.

**오류 응답**

```jsonc
{ "error": { "code": "UPSTREAM_UNAVAILABLE", "message": "..." } }
```

| 코드 | HTTP | 상황 |
|---|---|---|
| `STATION_NOT_FOUND` | 404 | 지원하지 않는 역 ID |
| `LINE_NOT_FOUND` | 404 | 지원하지 않는 노선 ID |
| `UPSTREAM_UNAVAILABLE` | 502 | 서울시 API 실패이며 stale 데이터도 없음 |
| `UPSTREAM_RATE_LIMITED` | 503 | 호출 제한 초과이며 stale 데이터도 없음 |

### 6.3 정적 노선 데이터

`lines/data/line9.json`. 9호선 38개 역을 개화(order 1)부터 중앙보훈병원(order 38)까지 순서대로 담는다.

```jsonc
{
  "lineId": "9",
  "lineName": "서울 지하철 9호선",
  "stations": [
    { "stationId": "...", "name": "개화",  "order": 1, "isExpressStop": false },
    { "stationId": "...", "name": "김포공항", "order": 2, "isExpressStop": true }
  ]
}
```

확장 규칙:

- 방향은 `order`의 증감으로만 판단한다. 노선별 특수 로직을 두지 않는다.
- 노선을 추가할 때 건드리는 곳은 `lines/data/` 뿐이다.
- 프론트엔드에 역 이름을 하드코딩하지 않는다.
- `isExpressStop`은 정보 제공용으로만 쓰이며 현재 어떤 필터링에도 근거로 쓰이지 않는다. 다만 값 자체는 공식 자료로 대조되지 않았으므로(2절 6번), 향후 이 값에 근거한 로직을 추가할 때는 먼저 대조가 필요하다.

### 6.4 열차 위치 계산

열차가 **현재 있는 역**을 기준으로, 선택한 역 쪽으로 얼마나 진행했는지를 0~1로 나타낸다.

| `status` | 의미 | `positionRatio` |
|---|---|---|
| `ARRIVED` | 해당 역 도착 | 0.0 |
| `DEPARTED` | 해당 역 출발 | 0.25 |
| `TRAVELING` | 역 사이 이동 | 0.5 |
| `APPROACHING` | 다음 역 진입 | 0.75 |

서울시 API는 현재 위치를 역 이름 문자열로 준다. `lines.service`가 이를 `line9.json`의 역명과 매칭해 `order`를 찾는다. **매칭에 실패한 열차는 조용히 버리지 않고 경고 로그를 남긴다** — 역명 표기가 예상과 다를 경우 이 로그에서 즉시 드러난다.

목표는 GPS 수준의 정확도가 아니라 사용자가 열차가 어느 구간에 있는지 이해하는 것이다.

### 6.5 캐시

- 키: `trains:{lineId}:{stationId}`
- TTL 10초. 새로고침 연타를 막는 것이 주 역할이다.
- 만료된 뒤에도 마지막 성공 데이터를 최대 5분간 별도 보관하여 `stale` 응답에 쓴다.
- NestJS 프로세스 메모리에만 존재한다. 재시작 시 사라져도 문제없다.
- 역 목록은 프로세스 시작 시 한 번 읽고 계속 보관한다.

---

## 7. 프론트엔드

### 7.1 구조

```
frontend/src/
├── App.tsx
├── api/
│   ├── client.ts              fetch 래퍼, 오류를 내부 형식으로 변환
│   └── subway.ts              getStations() / getTrains(stationId)
├── hooks/
│   ├── useStations.ts         역 목록 1회 조회
│   ├── useSelectedStation.ts  localStorage 연동
│   └── useTrainData.ts        열차 조회 + 수동 트리거   ★폴링 확장 지점
├── components/
│   ├── StationSelector.tsx
│   ├── DirectionPanel.tsx     방향 하나를 통째로 담당
│   ├── LineTrack.tsx          선 + 역 점
│   ├── TrainMarker.tsx        열차 점 + 남은 시간 + 급행 뱃지
│   ├── RefreshBar.tsx         갱신 시각 + 새로고침 버튼
│   └── states/                LoadingView · EmptyDirection · ErrorView · StaleBanner
├── types/subway.ts            백엔드 응답 타입
├── utils/trackPosition.ts     좌표 계산                 ★순수함수
└── styles/
```

`useTrainData`가 조회를 전부 감싼다. 나중에 폴링을 켤 때 이 파일 안에서 끝나고 컴포넌트는 수정하지 않는다.

### 7.2 화면

```
┌────────────────────────────┐
│  역   [ 증미          ▾ ]  │
├────────────────────────────┤
│  개화 방면                 │
│                            │
│  선유도─신목동─염창─등촌─증미│
│                ●           │
│               2분          │
│                            │
│  다음 열차 9분             │
├────────────────────────────┤
│  중앙보훈병원 방면         │
│                            │
│  신방화─마곡나루─양천향교─가양─증미│
│      접근 중인 열차 없음   │
├────────────────────────────┤
│  14:32:10 갱신 · 12초 전   │
│       [ 새로고침 ]         │
└────────────────────────────┘
```

스마트폰 세로 화면 한 화면에 들어가는 것을 기준으로 한다. UI 라이브러리는 쓰지 않고 일반 CSS로 구현한다.

### 7.3 트랙 표시 범위

9호선은 38개 역이므로 전부 그리면 모바일에서 읽을 수 없다.

**선택한 역 + 열차가 오는 쪽으로 4개 역, 총 5개**만 그린다. 역간 약 1.5~2분이므로 약 8분치 시야이며, 출발 판단에는 충분하다. 상수로 분리해 실사용 후 조정한다.

**두 방향 패널 모두 오른쪽 끝이 선택한 역이다.** 열차는 항상 왼쪽에서 오른쪽으로 다가온다. 방향마다 좌우가 뒤집히면 매번 어느 쪽이 내 역인지 다시 읽어야 하지만, 통일하면 시선이 오른쪽만 향하면 된다. 지리적 방향과 어긋나지만 원본 137~139줄이 이미 지리적 정확성을 포기했으므로 충돌하지 않는다.

표시 범위 밖의 열차는 점으로 그리지 않고 트랙 아래에 `다음 열차 9분` 텍스트 한 줄로 처리한다. 범위 밖 위치를 억지로 표현하는 것보다 단순하며 정보는 그대로 전달된다.

### 7.4 열차 표현

`utils/trackPosition.ts`가 좌표를 계산한다.

```
left(%) = (현재역 인덱스 + positionRatio) / 4 × 100
```

```css
.train { position: absolute; transition: left .4s ease-out; }
```

열차는 점으로 표현한다. 아이콘과 정교한 애니메이션은 MVP 이후로 미룬다.

급행 뱃지는 **선택한 역에 정차하는 급행**일 때만 붙인다. 정차하지 않는 급행은 도착정보 API가 애초에 내려주지 않으므로 화면에 나타나지 않는다.

### 7.5 상태 표시

| 상황 | 화면 |
|---|---|
| 첫 로딩 | 트랙 자리에 스켈레톤 |
| 해당 방향 열차 없음 | 트랙은 유지, 위에 "접근 중인 열차 없음" |
| `stale: true` | 상단 배너 "갱신 실패 · N분 전 데이터", 기존 열차는 흐리게 유지 |
| 완전 실패 (502/503) | 트랙 대신 오류 메시지 + 재시도 버튼 |
| 404 | "지원하지 않는 역입니다" + 역 선택으로 이동 |

새로고침 버튼은 3초 쿨다운을 건다. 백엔드 캐시가 이미 중복 호출을 막지만, 눌러도 반응이 없어 보이는 것보다 버튼이 잠기는 편이 정직하다. 조회 중에는 로딩 표시를 한다.

---

## 8. 환경변수

`.env.example`

```env
NODE_ENV=production
PORT=3000

SEOUL_OPEN_API_KEY=
SEOUL_SUBWAY_REALTIME_BASE_URL=

SUBWAY_CACHE_TTL_MS=10000
SUBWAY_STALE_MAX_AGE_MS=300000

# 수동 새로고침 방식이므로 현재 미사용. 폴링 도입 시 활성화.
# SUBWAY_POLLING_INTERVAL_MS=15000

DOMAIN=subway.example.com
```

- API 키는 프론트엔드 번들에 포함하지 않는다. 프론트엔드는 NestJS API만 호출한다.
- 실제 `.env`는 커밋하지 않는다(`.gitignore` 등록 완료).
- 백엔드는 시작 시 `SEOUL_OPEN_API_KEY` 존재를 검증하고, 없으면 즉시 실패한다.

---

## 9. Docker 및 nginx

```
docker-compose.yml
├── backend   NestJS, 내부 네트워크 :3000 (포트 미공개)
└── web       nginx :80, React dist 내장
```

**backend/Dockerfile** — 멀티 스테이지. 빌드 후 프로덕션 의존성만 남긴다.

```dockerfile
FROM node:22-alpine AS build
# npm ci → npm run build
FROM node:22-alpine
# npm ci --omit=dev + dist 복사 → node dist/main.js
```

**frontend/Dockerfile** — Vite 빌드 결과를 nginx 이미지에 넣는다.

```dockerfile
FROM node:22-alpine AS build
# npm ci → npm run build → /app/dist
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
```

**nginx.conf** 요점

```nginx
location /      { try_files $uri /index.html; }   # SPA 라우팅
location /api/  { proxy_pass http://backend:3000; }
gzip on;
```

### 라즈베리파이 관련 주의 (배포 시)

- `node:22-alpine`, `nginx:alpine` 모두 arm64를 지원하므로 64비트 OS면 그대로 동작한다.
- **RAM 2GB 이하인 파이에서는 Vite 빌드가 메모리 부족으로 실패할 수 있다.** 스왑을 늘리거나, PC에서 `docker buildx --platform linux/arm64`로 빌드해 이미지를 옮긴다.
- HTTPS는 도메인 연결 후 certbot으로 적용하며, 외부에는 80·443만 노출한다.
- 이번 범위는 로컬 동작과 Docker 구성까지다. 실제 배포는 별도 단계에서 진행한다.

---

## 10. 테스트

| 대상 | 방식 | API 키 없이 가능 |
|---|---|---|
| `seoul-api.mapper` | 픽스처 JSON → 내부 형식 변환 | 가능 |
| `train-position` | 상태코드 → `positionRatio` | 가능 |
| `lines.service` | 역 조회, 급행 판정, 잘못된 ID, 역명 매칭 실패 | 가능 |
| `trains.service` | 방향 분류, trainType 보존, stale 반환, 캐시 히트/미스 | 가능 (외부 목킹) |
| `trains.controller` | e2e, 외부 API 목킹 | 가능 |
| `utils/trackPosition` | 좌표 계산 | 가능 |
| 실제 API 응답 정합성 | 키 발급 후 픽스처 교체 | 불가 — 보류 |

픽스처는 서울시 공식 문서의 응답 예시로 시작하고, 키 발급 후 실제 응답으로 교체한다. 그때 깨지는 테스트가 2절의 추측 항목 중 틀린 것들이다.

수동 확인 항목: 증미역 기준 양방향 표시, 급행 정차역에서의 급행 뱃지 표시, 새로고침 쿨다운, 갱신 실패 시 stale 배너, 앱 재진입 시 역 유지, 스마트폰 세로 화면 가독성.

---

## 11. 구현 순서

1. `line9.json` 작성 (38개 역, order, isExpressStop) — 모든 것의 전제
2. 백엔드: config → lines → seoul-api(mapper, client) → trains → cache → 오류 필터
3. 프론트엔드: types → api → hooks → components → 상태 표시
4. Docker: backend/frontend Dockerfile → nginx.conf → docker-compose
5. 로컬에서 전체 구동 확인

상세 단계는 별도 구현 계획으로 분리한다.

---

## 12. MVP 성공 기준

1. 스마트폰 브라우저에서 접속된다.
2. 9호선 역을 선택할 수 있고, 다시 열면 마지막 역이 유지된다.
3. 선택한 역 기준 양방향 열차 정보가 보인다.
4. 열차가 어느 역 또는 어느 구간에 있는지 알 수 있다.
5. 선택한 역까지 남은 시간이 숫자로 보인다.
6. 새로고침으로 데이터를 갱신할 수 있고 마지막 갱신 시각이 보인다.
7. 증미역에 서지 않는 급행이 도착 예정으로 표시되지 않는다 (도착정보 API가 애초에 내려주지 않으므로 보장됨 — 백엔드는 별도로 필터링하지 않는다).
8. 실제 외출 전에 사용했을 때 열차 상황 판단에 도움이 된다.

UI 완성도와 애니메이션 부드러움은 성공 조건이 아니다.

---

## 13. MVP 이후 확장

- 정식 API 키 또는 활용사례 등록 → 호출 제한 완화 → **자동 폴링 도입**
- 노선 위치 API 병합으로 표시 열차 수 확대
- 다른 서울 지하철 노선 추가 (`lines/data/`에 JSON 추가)
- 자주 이용하는 역 저장, PWA, 홈 화면 위젯, 네이티브 앱
- 열차 아이콘, 자연스러운 애니메이션
- 집에서 역까지 이동 시간 설정 및 출발 시점 판단 보조
