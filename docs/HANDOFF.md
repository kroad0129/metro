# 인계 문서 — 다른 환경에서 이어서 작업하기

최종 갱신: 2026-07-22

## 지금 어디까지 됐나

**MVP 13개 태스크 전부 완료. 실제 API 키로 동작 확인됨.**

| 영역 | 상태 | 테스트 |
|---|---|---|
| 백엔드 (NestJS) | 완료 | 유닛 100 · e2e 5 |
| 프론트엔드 (React+Vite) | 완료 | 71 |
| Docker · nginx · compose | 완료, PC에서 실빌드·구동 확인 | — |
| 라즈베리파이 배포 | **미실행** | — |

증미역·가양역·당산역에서 실제 열차 데이터가 올바른 방향·시간으로 표시되는 것까지 확인했다.

## 새 환경 세팅

```bash
git clone https://github.com/kroad0129/metro.git
cd metro

# API 키는 저장소에 없다. 직접 넣어야 한다.
cp backend/.env.example backend/.env    # SEOUL_OPEN_API_KEY 채우기
cp backend/.env .env                    # Docker용

cd backend  && npm install
cd ../frontend && npm install
```

그다음은 README의 "개발" 절 그대로. Node 22 기준이다.

**API 키는 서울 열린데이터광장 마이페이지에서 다시 확인할 수 있다.** 저장소·커밋 히스토리 어디에도 키가 없는 것은 확인해 두었다.

## 설계에서 반드시 지켜야 할 것

구현하다 보면 되돌리고 싶어지는 결정들이라 이유를 적어둔다.

1. **폴링을 켜지 말 것.** 개발키가 1000회/일이라 15초 폴링이면 하루 4시간이면 소진된다. `useTrainData`에 "타이머를 2분 돌려도 재조회가 없어야 한다"는 테스트가 있다 — 이걸 지우고 싶어진다면 먼저 정식키를 받거나 서울 열린데이터 활용사례 등록으로 한도를 늘려야 한다.
2. **`updnLine`을 쓰지 말 것.** 개화행이 `"하행"`으로 온다. `statnFid`/`statnTid` 비교가 정답이다.
3. **`subwayId` 필터를 빼지 말 것.** 환승역에서 다른 노선 열차가 섞여 온다.
4. **오류 응답의 평평한 구조 처리를 건드리지 말 것.** 이게 깨지면 키 만료·할당량 소진이 조용히 "열차 없음"으로 보인다. 이 앱에서 제일 위험한 실패다.
5. **급행을 백엔드에서 다시 거르지 말 것.** 상류가 이미 걸러준다. 우리가 또 거르면 `isExpressStop`이 틀렸을 때 실제 열차가 사라진다.

## 남은 일

### 배포 (다음 단계)

- [ ] 라즈베리파이(arm64)에 `docker compose up --build`. RAM 2GB 이하면 Vite 빌드가 OOM으로 죽을 수 있다 — 스왑을 늘리거나 PC에서 `docker buildx --platform linux/arm64`로 빌드해 이미지를 옮긴다.
- [ ] 도메인 연결 + certbot으로 HTTPS. 외부에는 80·443만 노출.
- [ ] 스마트폰에서 실제로 열어보고 세로 화면 가독성 확인.
- [ ] 며칠 써보고 하루 실제 호출량 확인 (`docker compose logs backend | grep "서울시 API 호출"` — 클라이언트가 호출 횟수를 누적 로깅한다).

### 정리하면 좋을 것 (동작엔 지장 없음)

- [ ] `backend/README.md`가 NestJS 기본 보일러플레이트 그대로다.
- [ ] 미사용 devDependency: `ts-loader`, `tsconfig-paths`, `source-map-support`.
- [ ] 죽은 코드: `LinesService.getStationByOrder` (자기 테스트만 호출), `useStations()`의 `lineName` (아무도 안 씀), `.env.example`의 `DOMAIN` (읽는 곳 없음).
- [ ] `frontend/public/icons.svg`는 Vite 스캐폴드 잔재로 참조되지 않는다.
- [ ] `app.enableCors()`가 모든 오리진을 허용한다. nginx 뒤라 문제없지만 3000을 직접 노출할 일이 생기면 제한할 것.

### 알려진 자잘한 결함

- [ ] **캐시 히트 시 `updatedAt`이 현재 시각**이라 최대 10초 오래된 데이터가 "방금 갱신"으로 보인다. `CacheService.get()`이 `storedAt`을 같이 돌려주게 고치면 된다.
- [ ] **첫 로딩이 스켈레톤이 아니라 텍스트 한 줄**이다 (설계 7.5절과 다름). stale 상태에서 열차를 흐리게 표시하는 스타일도 없다.
- [ ] **`arvlCd` 4(전역진입)의 위치가 한 구간쯤 낙관적으로 그려진다.** 남은 시간은 정확하므로 판단에는 지장 없다.
- [ ] **내 역을 이미 출발한 열차가 역에 서 있는 것처럼 그려진다** (`arvlCd` 2 + 현재 위치가 내 역인 경우).
- [ ] **역 이름표와 열차 점의 좌표계가 다르다.** 이름표는 flex `space-between`, 점은 절대 위치 %라 몇 % 어긋난다. 미관 문제.
- [ ] **`isExpressStop` 값이 미검증이다.** 급행 뱃지 표시에만 쓰이므로 틀려도 열차가 사라지진 않는다. 공식 자료로 대조하면 좋다.
- [ ] `ERROR-337`(호출 한도 초과 추정 코드)이 벤더 명세에 없다. 한도를 실제로 넘겨봐야 진짜 코드를 알 수 있다.

### 나중에 (설계 문서 13절)

정식키 또는 활용사례 등록 → 자동 폴링 도입 → 다른 노선 추가 → PWA → 홈 화면 위젯.

## 서울시 API에 대해 알아낸 것

`docs/서울시+지하철+실시간+도착정보.xls`와 `...열차+위치정보.xls`가 벤더 공식 명세다 (확장자는 xls지만 실제로는 HTML 표).

실제 응답 캡처본이 `backend/test/fixtures/real/`에 있다 — 증미(일반역), 가양(급행역), 서울역(4개 노선 환승역). 테스트가 이걸 기준으로 돌아가므로 **덮어쓰지 말 것.**

- 인증키 없이 `sample` 키로 5건까지 호출 가능: `http://swopenapi.seoul.go.kr/api/subway/sample/json/realtimeStationArrival/0/5/증미`
- 역 ID는 `1009000900 + order` 규칙 (증미 = `1009000908`)
- `arvlCd`: 0 진입, 1 도착, 2 출발, 3 전역출발, 4 전역진입, 5 전역도착, 99 운행중
- `arvlMsg3`은 역명만 온다 (`"선유도"`, 접미사 없음)
- `barvlDt`가 `"0"`인 경우가 흔하다 (열차가 그 역에 정차 중일 때). `null`로 두고 열차는 유지한다
- `btrainSttus`: 급행 / ITX / 일반 / 특급
