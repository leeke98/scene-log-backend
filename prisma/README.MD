# Prisma 데이터베이스 설정

이 프로젝트는 Prisma를 사용하여 PostgreSQL 데이터베이스를 관리합니다.

## 설치

```bash
npm install prisma @prisma/client
```

## 데이터베이스 설정

1. `.env` 파일을 생성하고 데이터베이스 연결 URL을 설정하세요:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/scene_log?schema=public"
```

2. PostgreSQL 데이터베이스 생성:

```sql
CREATE DATABASE scene_log;
```

## Prisma 사용 방법

### 1. 데이터베이스 마이그레이션

스키마를 데이터베이스에 적용:

```bash
npx prisma migrate dev --name init
```

### 2. Prisma Client 생성

```bash
npx prisma generate
```

### 3. Prisma Studio (데이터베이스 GUI)

```bash
npx prisma studio
```

브라우저에서 `http://localhost:5555`로 접속하여 데이터베이스를 시각적으로 관리할 수 있습니다.

## 스키마 구조

### User (사용자)

- 사용자 인증 정보를 저장하는 테이블
- `tickets` 관계를 통해 사용자별 티켓 정보와 연결

### Ticket (티켓)

- 공연 티켓 정보를 저장하는 메인 테이블
- `userId`를 통해 User와 연결 (CASCADE 삭제)
- `castings` 관계를 통해 배우 정보와 연결

### TicketCasting (배우 캐스팅)

- 티켓별 배우 정보를 저장
- `ticketId`를 통해 Ticket과 연결 (CASCADE 삭제)

## 주요 필드

### User

- `id`: 사용자 고유 ID (UUID)
- `username`: 아이디 (로그인용, 유니크)
- `password`: 비밀번호 (해시)
- `nickname`: 닉네임
- `createdAt`, `updatedAt`: 타임스탬프

### Ticket

- `id`: 티켓 고유 ID (String)
- `userId`: 사용자 ID (외래키)
- `date`: 공연 날짜 (Date)
- `time`: 공연 시간 (Time)
- `performanceName`: 작품명
- `genre`: 장르 (연극/뮤지컬)
- `isChild`: 어린이 공연 여부
- `theater`: 극장명
- `seat`: 좌석 정보
- `ticketPrice`: 티켓 가격
- `companion`: 동행자
- `mdPrice`: MD 가격
- `rating`: 별점 (0-5)
- `review`: 공연 후기
- `posterUrl`: 포스터 URL
- `createdAt`, `updatedAt`: 타임스탬프

### TicketCasting

- `id`: 자동 증가 ID
- `ticketId`: 티켓 ID (외래키)
- `actorName`: 배우 이름
- `createdAt`: 생성일시

## 사용 예시

```typescript
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// 사용자 생성 (회원가입)
const hashedPassword = await bcrypt.hash("password123", 10);
const user = await prisma.user.create({
  data: {
    username: "user123",
    password: hashedPassword,
    nickname: "사용자",
  },
});

// 사용자 로그인
const foundUser = await prisma.user.findUnique({
  where: { username: "user123" },
});
// 비밀번호 검증은 bcrypt.compare() 사용

// 티켓 생성 (사용자와 연결)
const ticket = await prisma.ticket.create({
  data: {
    id: "ticket_001",
    userId: user.id,
    date: new Date("2024-01-15"),
    time: "20:00:00",
    performanceName: "지킬앤하이드",
    genre: "뮤지컬",
    theater: "블루스퀘어 신한카드홀",
    ticketPrice: 140000,
    mdPrice: 50000,
    castings: {
      create: [{ actorName: "배우1" }, { actorName: "배우2" }],
    },
  },
});

// 사용자별 티켓 조회 (배우 정보 포함)
const tickets = await prisma.ticket.findMany({
  where: {
    userId: user.id,
  },
  include: {
    castings: true,
  },
  orderBy: {
    date: "desc",
  },
});

// 사용자와 티켓 정보 함께 조회
const userWithTickets = await prisma.user.findUnique({
  where: { id: user.id },
  include: {
    tickets: {
      include: {
        castings: true,
      },
    },
  },
});
```
