/**
 * 배우 데이터 마이그레이션 스크립트
 *
 * ticket_castings 테이블의 actorName 데이터를 actors + ticket_actors 구조로 이전합니다.
 *
 * 실행 방법:
 *   npx ts-node prisma/migrate-casting.ts
 *
 * 마이그레이션 규칙:
 *   - 같은 유저가 등록한 같은 이름의 배우 → actors에 하나의 row만 생성
 *   - 다른 유저가 등록한 같은 이름의 배우 → 별도 row로 생성
 *   - 생성되는 모든 actor의 status = 'unverified'
 *
 * 순서:
 *   1. ticket_castings 데이터를 userId + actorName 기준으로 actors 테이블에 삽입
 *   2. ticket_actors 테이블에 (ticket_id, actor_id) 삽입
 *   3. 검증 후 ticket_castings 제거는 schema에서 TicketCasting 모델 삭제 + prisma db push 로 처리
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== 배우 데이터 마이그레이션 시작 ===\n");

  // 1. 모든 ticket_castings 조회 (ticket의 userId 포함)
  const castings = await prisma.ticketCasting.findMany({
    include: {
      ticket: { select: { userId: true } },
    },
    orderBy: { id: "asc" },
  });

  console.log(`총 ${castings.length}개의 casting 레코드 발견\n`);

  if (castings.length === 0) {
    console.log("마이그레이션할 데이터가 없습니다.");
    return;
  }

  // 2. (userId, actorName) 기준으로 중복 제거하여 actor map 생성
  //    key: `${userId}::${actorName}` → actorId
  const actorKeyToId = new Map<string, string>();

  // 기존에 이미 생성된 actors가 있을 수 있으므로 확인
  const existingActors = await prisma.actor.findMany({
    select: { id: true, name: true, createdBy: true },
  });
  for (const actor of existingActors) {
    actorKeyToId.set(`${actor.createdBy}::${actor.name}`, actor.id);
  }
  console.log(`기존 actor ${existingActors.length}개 로드 완료`);

  // 3. 신규 actors 생성
  let createdActorCount = 0;
  const toCreate: { userId: string; actorName: string }[] = [];

  for (const casting of castings) {
    const key = `${casting.ticket.userId}::${casting.actorName}`;
    if (!actorKeyToId.has(key)) {
      toCreate.push({ userId: casting.ticket.userId, actorName: casting.actorName });
      // 중복 방지를 위해 미리 placeholder 등록
      actorKeyToId.set(key, "__pending__");
    }
  }

  // 중복 제거 후 배치 생성
  const uniqueToCreate = toCreate.filter((item, index, self) =>
    index === self.findIndex((t) => t.userId === item.userId && t.actorName === item.actorName)
  );

  console.log(`\n신규 생성할 actor ${uniqueToCreate.length}개`);

  for (const { userId, actorName } of uniqueToCreate) {
    const actor = await prisma.actor.create({
      data: {
        name: actorName,
        status: "unverified",
        createdBy: userId,
      },
    });
    actorKeyToId.set(`${userId}::${actorName}`, actor.id);
    createdActorCount++;

    if (createdActorCount % 50 === 0) {
      console.log(`  actor ${createdActorCount}/${uniqueToCreate.length} 생성 완료...`);
    }
  }
  console.log(`actor 생성 완료: ${createdActorCount}개\n`);

  // 4. ticket_actors 삽입
  //    이미 존재하는 (ticketId, actorId) 쌍은 건너뜀
  const existingTicketActors = await prisma.ticketActor.findMany({
    select: { ticketId: true, actorId: true },
  });
  const existingPairs = new Set(existingTicketActors.map((ta) => `${ta.ticketId}::${ta.actorId}`));

  const ticketActorData: { ticketId: string; actorId: string }[] = [];

  for (const casting of castings) {
    const key = `${casting.ticket.userId}::${casting.actorName}`;
    const actorId = actorKeyToId.get(key);
    if (!actorId || actorId === "__pending__") {
      console.warn(`  경고: actorId를 찾을 수 없음 - ticketId=${casting.ticketId}, actorName=${casting.actorName}`);
      continue;
    }

    const pair = `${casting.ticketId}::${actorId}`;
    if (!existingPairs.has(pair)) {
      ticketActorData.push({ ticketId: casting.ticketId, actorId });
      existingPairs.add(pair); // 중복 방지
    }
  }

  console.log(`ticket_actors 삽입 예정: ${ticketActorData.length}개`);

  // 배치로 삽입
  const BATCH_SIZE = 100;
  let insertedCount = 0;
  for (let i = 0; i < ticketActorData.length; i += BATCH_SIZE) {
    const batch = ticketActorData.slice(i, i + BATCH_SIZE);
    await prisma.ticketActor.createMany({ data: batch, skipDuplicates: true });
    insertedCount += batch.length;
    if (insertedCount % 500 === 0 || insertedCount === ticketActorData.length) {
      console.log(`  ticket_actors ${insertedCount}/${ticketActorData.length} 삽입 완료...`);
    }
  }

  // 5. 검증
  console.log("\n=== 마이그레이션 검증 ===");
  const originalCount = castings.length;
  const migratedCount = await prisma.ticketActor.count();
  const actorCount = await prisma.actor.count();

  console.log(`원본 ticket_castings 레코드: ${originalCount}개`);
  console.log(`마이그레이션된 ticket_actors 레코드: ${migratedCount}개`);
  console.log(`생성된 actors: ${actorCount}개`);

  if (migratedCount < originalCount) {
    console.warn(`\n⚠️  주의: ticket_actors(${migratedCount}) < ticket_castings(${originalCount})`);
    console.warn("   중복 (ticketId, actorId) 쌍이 건너뛰어졌을 수 있습니다.");
  } else {
    console.log("\n✅ 마이그레이션 성공!");
  }

  console.log(`
=== 다음 단계 ===
마이그레이션 검증 후 ticket_castings 테이블을 제거하려면:
  1. prisma/schema.prisma에서 TicketCasting 모델과 Ticket.castings 관계 삭제
  2. npx prisma db push 실행
`);
}

main()
  .catch((e) => {
    console.error("마이그레이션 오류:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
