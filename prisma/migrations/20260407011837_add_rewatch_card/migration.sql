-- CreateEnum
CREATE TYPE "RewatchRewardType" AS ENUM ('DISCOUNT_VOUCHER', 'MERCHANDISE');

-- CreateTable
CREATE TABLE "rewatch_seasons" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mt20id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "poster_url" TEXT,
    "start_date" TEXT,
    "end_date" TEXT,
    "venue" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewatch_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewatch_milestones" (
    "id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "stamp_count" INTEGER NOT NULL,
    "reward_type" "RewatchRewardType" NOT NULL,
    "discount_percent" INTEGER,
    "voucher_qty" INTEGER DEFAULT 1,
    "merchandise_desc" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rewatch_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewatch_cards" (
    "id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewatch_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewatch_card_tickets" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "stamp_count" INTEGER NOT NULL DEFAULT 1,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rewatch_card_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewatch_voucher_usages" (
    "id" TEXT NOT NULL,
    "milestone_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rewatch_voucher_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewatch_merchandise_receipts" (
    "id" TEXT NOT NULL,
    "milestone_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "received" BOOLEAN NOT NULL DEFAULT false,
    "received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rewatch_merchandise_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_rewatch_season_user_id" ON "rewatch_seasons"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "rewatch_seasons_user_id_mt20id_key" ON "rewatch_seasons"("user_id", "mt20id");

-- CreateIndex
CREATE INDEX "idx_rewatch_milestone_season_id" ON "rewatch_milestones"("season_id");

-- CreateIndex
CREATE INDEX "idx_rewatch_card_season_id" ON "rewatch_cards"("season_id");

-- CreateIndex
CREATE INDEX "idx_rewatch_card_ticket_card_id" ON "rewatch_card_tickets"("card_id");

-- CreateIndex
CREATE UNIQUE INDEX "rewatch_card_tickets_card_id_ticket_id_key" ON "rewatch_card_tickets"("card_id", "ticket_id");

-- CreateIndex
CREATE INDEX "idx_rewatch_voucher_usage" ON "rewatch_voucher_usages"("milestone_id", "card_id");

-- CreateIndex
CREATE UNIQUE INDEX "rewatch_merchandise_receipts_milestone_id_card_id_key" ON "rewatch_merchandise_receipts"("milestone_id", "card_id");

-- AddForeignKey
ALTER TABLE "rewatch_seasons" ADD CONSTRAINT "rewatch_seasons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewatch_milestones" ADD CONSTRAINT "rewatch_milestones_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "rewatch_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewatch_cards" ADD CONSTRAINT "rewatch_cards_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "rewatch_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewatch_card_tickets" ADD CONSTRAINT "rewatch_card_tickets_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "rewatch_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewatch_card_tickets" ADD CONSTRAINT "rewatch_card_tickets_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewatch_voucher_usages" ADD CONSTRAINT "rewatch_voucher_usages_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "rewatch_milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewatch_voucher_usages" ADD CONSTRAINT "rewatch_voucher_usages_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "rewatch_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewatch_voucher_usages" ADD CONSTRAINT "rewatch_voucher_usages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewatch_merchandise_receipts" ADD CONSTRAINT "rewatch_merchandise_receipts_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "rewatch_milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewatch_merchandise_receipts" ADD CONSTRAINT "rewatch_merchandise_receipts_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "rewatch_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
