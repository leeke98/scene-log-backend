-- CreateTable
CREATE TABLE "user_performance_marks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kopis_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "poster_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_performance_marks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_marks_user_id" ON "user_performance_marks"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_performance_marks_user_id_kopis_id_key" ON "user_performance_marks"("user_id", "kopis_id");

-- AddForeignKey
ALTER TABLE "user_performance_marks" ADD CONSTRAINT "user_performance_marks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
