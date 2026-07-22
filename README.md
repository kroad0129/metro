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

- 64비트 Raspberry Pi OS 필요. `node:22-alpine`, `nginx:alpine` 모두 arm64를 지원한다.
- **RAM 2GB 이하에서는 Vite 빌드가 메모리 부족으로 실패할 수 있다.** 스왑을 늘리거나 PC에서 `docker buildx --platform linux/arm64`로 빌드해 이미지를 옮긴다.
- HTTPS는 도메인 연결 후 certbot으로 적용하며 외부에는 80·443만 노출한다.
