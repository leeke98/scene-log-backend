# Scene Log Backend

공연 관람 기록 서비스 Scene Log의 백엔드 API 서버입니다. 연극/뮤지컬 티켓, 배우, 리포트, 재관람카드 등을 관리합니다.

## 기술 스택

- **Runtime**: Node.js + TypeScript (v5.3.3)
- **Framework**: Express.js (v4.18.2)
- **ORM**: Prisma (v5.7.1) + PostgreSQL (Supabase)
- **Auth**: JWT (액세스 토큰) + httpOnly 쿠키 (리프레시 토큰) + Google OAuth
- **Image**: Cloudinary (포스터/배우 이미지 업로드)
- **Docs**: Swagger UI (`/api-docs`)
- **Dev**: ts-node-dev (핫 리로드)

## 프로젝트 구조

```
scene-log-backend/
├── src/
│   ├── index.ts              # 앱 진입점 — Express 초기화, 미들웨어, 라우트 등록
│   ├── middleware/
│   │   └── auth.ts           # JWT 검증 미들웨어 (req.user 주입)
│   ├── routes/
│   │   ├── auth.ts           # 로그인/회원가입/Google OAuth/토큰 갱신/로그아웃
│   │   ├── users.ts          # 사용자 프로필
│   │   ├── tickets.ts        # 티켓 CRUD
│   │   ├── actors.ts         # 배우 조회 및 관리
│   │   ├── marks.ts          # 위시리스트(공연 북마크)
│   │   ├── rewatch.ts        # 재관람카드 (시즌/카드/마일스톤)
│   │   ├── kopis.ts          # KOPIS 외부 API 프록시
│   │   ├── proxy.ts          # 일반 CORS 프록시
│   │   └── reports/
│   │       ├── index.ts      # 리포트 라우터
│   │       ├── overall.ts    # 전체 통계
│   │       ├── performances.ts # 공연별 통계
│   │       └── actors.ts     # 배우별 통계
│   ├── lib/
│   │   ├── prisma.ts         # Prisma Client 싱글톤
│   │   ├── cloudinary.ts     # Cloudinary 이미지 업로드
│   │   └── utils.ts          # 공통 유틸
│   └── config/
│       └── swagger.ts        # Swagger 스펙 설정
├── prisma/
│   ├── schema.prisma         # DB 스키마
│   └── migrations/           # 마이그레이션 이력
├── .env                      # 환경 변수 (git 제외)
├── .env.example              # 환경 변수 예시
├── package.json
└── tsconfig.json
```

## API 라우트 (모두 `/api` 하위)

| 경로 | 설명 |
|---|---|
| `POST /auth/signup` | 회원가입 |
| `POST /auth/login` | 로컬 로그인 |
| `POST /auth/google` | Google OAuth 로그인 |
| `POST /auth/refresh` | 액세스 토큰 갱신 |
| `POST /auth/logout` | 로그아웃 (쿠키 삭제) |
| `GET/PATCH /users/me` | 내 프로필 조회/수정 |
| `GET/POST /tickets` | 티켓 목록 조회/생성 |
| `GET/PATCH/DELETE /tickets/:id` | 티켓 상세/수정/삭제 |
| `GET /actors` | 배우 검색 |
| `GET/POST/PATCH /actors/:id` | 배우 조회/수정 |
| `GET/POST /marks` | 위시리스트 조회/추가 |
| `DELETE /marks/:kopisId` | 위시리스트 삭제 |
| `GET/POST /rewatch/seasons` | 재관람 시즌 목록/생성 |
| `GET/* /rewatch/*` | 카드, 마일스톤, 도장 등 |
| `GET /kopis/*` | KOPIS API 프록시 |
| `GET /proxy` | CORS 우회 프록시 |
| `GET /reports/overall` | 전체 통계 |
| `GET /reports/performances` | 공연별 통계 |
| `GET /reports/actors` | 배우별 통계 |

## 데이터베이스 스키마

```
User ──< Ticket ──< TicketActor >── Actor
     ──< RefreshToken              └── UserActorImage
     ──< UserPerformanceMark (위시리스트)
     ──< RewatchSeason ──< RewatchCard ──< RewatchCardTicket >── Ticket
                       ──< RewatchMilestone ──< RewatchMilestoneReward
                                                └── RewatchVoucherUsage
                                                └── RewatchMerchandiseReceipt
```

- `Actor`: `unverified` / `verified` / `merged` 상태, 중복 병합 시 `canonicalId`로 자기 참조
- `RewatchSeason`: KOPIS `mt20id` 기준 공연 시즌, 사용자별 재관람카드 관리

## 환경 변수

`.env.example`을 `.env`로 복사 후 설정:

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | Supabase pooled connection (pgbouncer, 런타임 쿼리용) |
| `DIRECT_URL` | Supabase direct connection (Prisma 마이그레이션용) |
| `JWT_SECRET` | 액세스 토큰 서명 키 |
| `JWT_EXPIRES_IN` | 액세스 토큰 만료 (기본 `15m`) |
| `REFRESH_TOKEN_SECRET` | 리프레시 토큰 서명 키 |
| `REFRESH_TOKEN_EXPIRES_IN` | 리프레시 토큰 만료 (기본 `7d`) |
| `GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary 클라우드명 |
| `CLOUDINARY_API_KEY` | Cloudinary API 키 |
| `CLOUDINARY_API_SECRET` | Cloudinary API 시크릿 |

## 스크립트

```bash
npm run dev          # 개발 서버 실행 (ts-node-dev, 핫 리로드)
npm run build        # prisma generate + tsc 컴파일
npm run start        # 컴파일된 dist/ 실행
npm run type-check   # 타입 체크만 수행 (tsc --noEmit)
npm run prisma:studio  # Prisma Studio GUI 실행
```

## Prisma 마이그레이션 (중요)

> **라이브 Supabase DB에 실제 데이터가 있습니다. 아래 절차를 반드시 따르세요.**

**절대 사용 금지:**
- `npm run prisma:migrate` (`prisma migrate dev`) — drift 감지 시 DB 초기화 가능
- `npm run prisma:push` (`prisma db push`) — 마이그레이션 이력 없이 스키마 덮어씀

**안전한 마이그레이션 절차:**

```bash
# 1. 마이그레이션 파일만 생성 (DB 미적용)
npx prisma migrate dev --create-only --name <이름>

# 2. 생성된 SQL 검토 — DROP 없이 ADD만 있는지 확인
# prisma/migrations/<timestamp>_<이름>/migration.sql

# 3. 라이브 DB에 안전하게 적용
npx prisma migrate deploy

# 4. Prisma Client 재생성
npx prisma generate
```

## 라이선스

ISC
