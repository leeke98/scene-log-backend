# Scene Log Backend

Scene Log는 공연 관람 기록을 관리하는 애플리케이션의 백엔드 API 서버입니다. 사용자는 자신이 관람한 연극/뮤지컬 티켓 정보를 기록하고, 배우 정보, 후기, 별점 등을 관리할 수 있습니다.

## 기술 스택

### 개발 언어 및 런타임

- **TypeScript** (v5.3.3) - 정적 타입 검사를 위한 언어
- **Node.js** - JavaScript 런타임 환경

### 프레임워크 및 라이브러리

- **Express.js** (v4.18.2) - 웹 애플리케이션 프레임워크
- **Prisma** (v5.7.1) - ORM (Object-Relational Mapping)

### 데이터베이스

- **PostgreSQL** - 관계형 데이터베이스

### 개발 도구

- **ts-node-dev** - TypeScript 개발 서버 (핫 리로드)
- **TypeScript** - 타입 체크 및 컴파일

## 개발 환경

### 필수 요구사항

- Node.js (v18 이상 권장)
- PostgreSQL (v12 이상)
- npm 또는 yarn

## 프로젝트 구조

```
scene-log-backend/
├── src/                    # 소스 코드
│   ├── index.ts           # 애플리케이션 진입점 및 서버 설정
│   ├── lib/               # 라이브러리 및 유틸리티
│   │   └── prisma.ts      # Prisma Client 인스턴스
│   ├── routes/            # API 라우트
│   │   └── users.ts       # 사용자 관련 API 엔드포인트
│   └── config/            # 설정 파일
├── prisma/                # Prisma 관련 파일
│   ├── schema.prisma      # 데이터베이스 스키마 정의
│   └── README.MD          # Prisma 사용 가이드
├── dist/                  # 컴파일된 JavaScript 파일 (빌드 후 생성)
├── .env                   # 환경 변수 (git에 포함되지 않음)
├── .env.example           # 환경 변수 예시 파일
├── .gitignore            # Git 제외 파일 목록
├── package.json           # 프로젝트 의존성 및 스크립트
├── tsconfig.json          # TypeScript 설정
└── README.md             # 프로젝트 문서
```

### 주요 디렉토리 설명

#### `src/`

- **`index.ts`**: Express 애플리케이션 초기화, 미들웨어 설정, 라우트 등록, 서버 시작
- **`lib/prisma.ts`**: Prisma Client 싱글톤 인스턴스 생성 및 관리
- **`routes/users.ts`**: 사용자 관련 API 엔드포인트 (생성, 조회 등)

#### `prisma/`

- **`schema.prisma`**: 데이터베이스 모델 정의 (User, Ticket, TicketCasting)
- **`README.MD`**: Prisma 사용 방법 및 데이터베이스 구조 설명

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 데이터베이스 설정

PostgreSQL 데이터베이스를 생성하고 `.env` 파일에 연결 정보를 설정하세요.

```sql
CREATE DATABASE scene_log;
```

### 3. Prisma 마이그레이션

```bash
npm run prisma:migrate
```

### 4. Prisma Client 생성

```bash
npm run prisma:generate
```

### 5. 개발 서버 실행

```bash
npm run dev
```

### 6. 프로덕션 빌드

```bash
npm run build
npm start
```

## 스크립트

- `npm run dev` - 개발 서버 실행 (핫 리로드)
- `npm run build` - TypeScript 컴파일
- `npm run start` - 프로덕션 서버 실행
- `npm run type-check` - 타입 체크만 수행
- `npm run prisma:generate` - Prisma Client 생성
- `npm run prisma:migrate` - 데이터베이스 마이그레이션
- `npm run prisma:studio` - Prisma Studio 실행 (데이터베이스 GUI)
- `npm run prisma:push` - 스키마를 데이터베이스에 직접 푸시

## 라이선스

ISC
