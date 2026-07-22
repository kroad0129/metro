# 9호선 열차 위치 확인

선택한 서울 지하철 9호선 역으로 다가오는 양방향 열차가 지금 어디에 있고 몇 분 뒤 도착하는지 보여주는 개인용 웹 서비스.

집에서 나서기 전에 "지금 나가야 하나, 뛰어야 하나, 좀 있다 나가도 되나"를 판단하는 용도다.

```
증미역                                        2분 전 갱신  [새로고침]

개화 방면
  선유도 ─ 신목동 ─ 염창 ─ 등촌 ─ 증미
              ●▸
            5분 45초
  다음 열차 14분 45초

중앙보훈병원 방면
  신방화 ─ 마곡나루 ─ 양천향교 ─ 가양 ─ 증미
                          ●▸
                        6분 15초
```

- 설계: [`docs/superpowers/specs/2026-07-22-subway-tracker-design.md`](docs/superpowers/specs/2026-07-22-subway-tracker-design.md)
- 구현 계획: [`docs/superpowers/plans/2026-07-22-subway-tracker-mvp.md`](docs/superpowers/plans/2026-07-22-subway-tracker-mvp.md)
- 현재 상태와 남은 일: [`docs/HANDOFF.md`](docs/HANDOFF.md)

## 준비

[서울 열린데이터광장](https://data.seoul.go.kr)에서 실시간 지하철 API 키를 발급받는다.

`.env` 파일은 두 군데가 쓰인다. 내용은 같아도 되고, **둘 다 커밋하지 않는다.**

| 파일 | 쓰이는 곳 |
|---|---|
| `backend/.env` | 로컬 개발 (`npm run start:dev`) |
| `.env` (루트) | Docker Compose (`env_file`) |

```bash
cp backend/.env.example backend/.env   # SEOUL_OPEN_API_KEY 채우기
cp backend/.env .env                   # Docker용으로 복사
```

키 없이 구조만 보고 싶으면 `sample`을 넣어도 된다. 서울시 공개 샘플 키이며 **한 번에 5건 제한**이라, 요청 범위가 `0/20`인 현재 코드로는 `ERROR-335`가 나서 502로 떨어진다. 역 목록 화면까지는 정상 동작한다.

## 개발

```bash
cd backend  && npm install && npm run start:dev   # :3000
cd frontend && npm install && npm run dev         # :5173
```

http://localhost:5173 접속. Vite 개발 서버가 `/api`를 백엔드로 프록시한다.

> 개발 모드에서는 React StrictMode 때문에 첫 진입 시 API가 **2번** 호출된다. 프로덕션 빌드는 1번이다. 하루 1000회 예산을 쓰는 중이라면 켜둔 채 방치하지 말 것.

## 테스트

```bash
cd backend  && npx jest && npx jest --config test/jest-e2e.json   # 100 + 5
cd frontend && npm test                                            # 71
```

외부 API를 실제로 호출하는 테스트는 없다. `backend/test/fixtures/real/`에 실제 응답을 캡처해 두고 그걸로 검증한다.

## Docker로 실행

```bash
docker compose up --build
```

http://localhost 접속. nginx만 80포트로 노출되고 백엔드는 내부 네트워크에만 있다 — API 키를 쥔 프로세스가 인터넷에 직접 닿지 않는다.

## 동작 방식에서 알아둘 것

**자동 갱신이 없다.** 개발키 호출 한도가 1000회/일이라 15초 폴링이면 하루 4시간이면 소진된다. 새로고침 버튼으로 직접 갱신하며 연타 방지로 3초 쿨다운이 걸려 있다. 화면의 남은 시간은 마지막 조회 시각을 기준으로 **브라우저에서 1초씩 깎아 내려간다** — 추가 API 호출은 없다.

**방향은 `updnLine`으로 판정하지 않는다.** 서울시 도착정보 API는 개화행을 `"하행"`으로 표기하고, 자매 API인 `realtimePosition`은 같은 방향을 반대로 표기한다. 대신 `statnFid`(이전역ID)와 `statnTid`(다음역ID)를 비교한다.

**환승역에서는 다른 노선 열차가 섞여 온다.** 당산역 응답에 2호선 열차가 들어 있고 당산은 두 노선 모두에 있는 역명이라, 거르지 않으면 유령 열차가 생긴다. `subwayId`로 필터링한다.

**급행은 백엔드에서 거르지 않는다.** 서울시 API가 해당 역에 서지 않는 급행을 이미 빼고 준다(증미 급행 0대, 가양 급행 2대로 실측 확인). 우리가 한 번 더 거르면 `isExpressStop` 값이 틀렸을 때 실제 오는 열차를 지워버리므로 하지 않는다. 급행 여부는 뱃지로만 표시한다.

**오류 응답은 평평한 구조다.** 성공은 `{"errorMessage":{...},"realtimeArrivalList":[...]}`이지만 실패는 `{"status":500,"code":"INFO-100",...}`처럼 래퍼가 없다. 두 형태를 모두 읽어야 하며, 그러지 않으면 키 만료·할당량 소진이 전부 "열차 없음"으로 표시된다.

**두 방향 패널 모두 오른쪽 끝이 선택한 역이다.** 지리적 방향과는 어긋나지만, 열차가 항상 왼쪽에서 오른쪽으로 다가와 시선이 한쪽만 향하면 된다.

## 라즈베리파이 배포 (미실행)

- 64비트 Raspberry Pi OS 필요. `node:22-alpine`, `nginx:alpine` 모두 arm64를 지원한다.
- **RAM 2GB 이하에서는 Vite 빌드가 메모리 부족으로 실패할 수 있다.** 스왑을 늘리거나 PC에서 `docker buildx --platform linux/arm64`로 빌드해 이미지를 옮긴다.
- HTTPS는 도메인 연결 후 certbot으로 적용하며 외부에는 80·443만 노출한다.

## 브랜치

| 브랜치 | 내용 |
|---|---|
| `main` | 전체 (기본) |
| `feat/backend-api` | NestJS + 서울시 API 연동 + 캐시·오류 처리까지 |
| `feat/frontend-ui` | React 트랙 UI + 훅 + 앱 셸까지 |
| `feat/docker-deploy` | Dockerfile · nginx · compose까지 |
| `master` | 설계 문서와 구현 계획만 |
