-- CreateEnum
CREATE TYPE "Genre" AS ENUM ('THEATER', 'MUSICAL');

-- CreateEnum
CREATE TYPE "ActorStatus" AS ENUM ('unverified', 'verified', 'merged');

-- CreateEnum
CREATE TYPE "ActorDomain" AS ENUM ('MUSICAL', 'THEATER', 'CLASSIC', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT,
    "nickname" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'local',
    "provider_id" TEXT,
    "email" TEXT,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time" TIME NOT NULL,
    "performance_name" TEXT NOT NULL,
    "genre" "Genre",
    "is_child" BOOLEAN NOT NULL DEFAULT false,
    "theater" TEXT NOT NULL,
    "seat" TEXT,
    "ticket_price" INTEGER NOT NULL DEFAULT 0,
    "companion" TEXT,
    "md_price" INTEGER NOT NULL DEFAULT 0,
    "rating" INTEGER NOT NULL DEFAULT 0,
    "review" TEXT,
    "poster_url" TEXT,
    "is_linked" BOOLEAN NOT NULL DEFAULT false,
    "kopis_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birth_year" INTEGER,
    "domain" "ActorDomain",
    "status" "ActorStatus" NOT NULL DEFAULT 'unverified',
    "canonical_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_actors" (
    "ticket_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,

    CONSTRAINT "ticket_actors_pkey" PRIMARY KEY ("ticket_id","actor_id")
);

-- CreateTable
CREATE TABLE "actor_reports" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "reported_by" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "duplicate_actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actor_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "idx_username" ON "users"("username");

-- CreateIndex
CREATE INDEX "idx_provider" ON "users"("provider", "provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "idx_refresh_token_user_id" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_id" ON "tickets"("user_id");

-- CreateIndex
CREATE INDEX "idx_date" ON "tickets"("date");

-- CreateIndex
CREATE INDEX "idx_performance_name" ON "tickets"("performance_name");

-- CreateIndex
CREATE INDEX "idx_genre" ON "tickets"("genre");

-- CreateIndex
CREATE INDEX "idx_theater" ON "tickets"("theater");

-- CreateIndex
CREATE INDEX "idx_rating" ON "tickets"("rating");

-- CreateIndex
CREATE INDEX "idx_actors_name" ON "actors"("name");

-- CreateIndex
CREATE INDEX "idx_actors_status" ON "actors"("status");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actors" ADD CONSTRAINT "actors_canonical_id_fkey" FOREIGN KEY ("canonical_id") REFERENCES "actors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actors" ADD CONSTRAINT "actors_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_actors" ADD CONSTRAINT "ticket_actors_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_actors" ADD CONSTRAINT "ticket_actors_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actor_reports" ADD CONSTRAINT "actor_reports_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actor_reports" ADD CONSTRAINT "actor_reports_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
