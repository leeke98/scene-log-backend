-- CreateTable
CREATE TABLE "user_actor_images" (
    "user_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_actor_images_pkey" PRIMARY KEY ("user_id","actor_id")
);

-- AddForeignKey
ALTER TABLE "user_actor_images" ADD CONSTRAINT "user_actor_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_actor_images" ADD CONSTRAINT "user_actor_images_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
