-- Step 1: rewatch_milestone_rewards 테이블 생성
CREATE TABLE "rewatch_milestone_rewards" (
    "id" TEXT NOT NULL,
    "milestone_id" TEXT NOT NULL,
    "reward_type" "RewatchRewardType" NOT NULL,
    "discount_percent" INTEGER,
    "voucher_qty" INTEGER DEFAULT 1,
    "merchandise_desc" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rewatch_milestone_rewards_pkey" PRIMARY KEY ("id")
);

-- Step 2: 기존 마일스톤 데이터 → 혜택 행으로 마이그레이션
INSERT INTO "rewatch_milestone_rewards" ("id", "milestone_id", "reward_type", "discount_percent", "voucher_qty", "merchandise_desc", "created_at")
SELECT gen_random_uuid()::text, "id", "reward_type", "discount_percent", "voucher_qty", "merchandise_desc", "created_at"
FROM "rewatch_milestones";

-- Step 3: rewatch_voucher_usages에 reward_id 컬럼 추가 (nullable)
ALTER TABLE "rewatch_voucher_usages" ADD COLUMN "reward_id" TEXT;

-- Step 4: reward_id 값 채우기 (milestone_id → reward_id)
UPDATE "rewatch_voucher_usages" v
SET "reward_id" = r."id"
FROM "rewatch_milestone_rewards" r
WHERE r."milestone_id" = v."milestone_id";

-- Step 5: rewatch_merchandise_receipts에 reward_id 컬럼 추가 (nullable)
ALTER TABLE "rewatch_merchandise_receipts" ADD COLUMN "reward_id" TEXT;

-- Step 6: reward_id 값 채우기
UPDATE "rewatch_merchandise_receipts" mr
SET "reward_id" = r."id"
FROM "rewatch_milestone_rewards" r
WHERE r."milestone_id" = mr."milestone_id";

-- Step 7: 기존 FK 제약조건 및 인덱스 제거
ALTER TABLE "rewatch_voucher_usages" DROP CONSTRAINT "rewatch_voucher_usages_milestone_id_fkey";
ALTER TABLE "rewatch_merchandise_receipts" DROP CONSTRAINT "rewatch_merchandise_receipts_milestone_id_fkey";
DROP INDEX "rewatch_merchandise_receipts_milestone_id_card_id_key";
DROP INDEX "idx_rewatch_voucher_usage";

-- Step 8: reward_id NOT NULL 설정
ALTER TABLE "rewatch_voucher_usages" ALTER COLUMN "reward_id" SET NOT NULL;
ALTER TABLE "rewatch_merchandise_receipts" ALTER COLUMN "reward_id" SET NOT NULL;

-- Step 9: 기존 milestone_id 컬럼 제거
ALTER TABLE "rewatch_voucher_usages" DROP COLUMN "milestone_id";
ALTER TABLE "rewatch_merchandise_receipts" DROP COLUMN "milestone_id";

-- Step 10: 마일스톤에서 혜택 관련 컬럼 제거
ALTER TABLE "rewatch_milestones" DROP COLUMN "reward_type";
ALTER TABLE "rewatch_milestones" DROP COLUMN "discount_percent";
ALTER TABLE "rewatch_milestones" DROP COLUMN "voucher_qty";
ALTER TABLE "rewatch_milestones" DROP COLUMN "merchandise_desc";

-- Step 11: 새 FK 추가
ALTER TABLE "rewatch_milestone_rewards" ADD CONSTRAINT "rewatch_milestone_rewards_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "rewatch_milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rewatch_voucher_usages" ADD CONSTRAINT "rewatch_voucher_usages_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewatch_milestone_rewards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rewatch_merchandise_receipts" ADD CONSTRAINT "rewatch_merchandise_receipts_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewatch_milestone_rewards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 12: 새 인덱스 추가
CREATE INDEX "idx_rewatch_reward_milestone_id" ON "rewatch_milestone_rewards"("milestone_id");
CREATE INDEX "idx_rewatch_voucher_usage" ON "rewatch_voucher_usages"("reward_id", "card_id");
CREATE UNIQUE INDEX "rewatch_merchandise_receipts_reward_id_card_id_key" ON "rewatch_merchandise_receipts"("reward_id", "card_id");
