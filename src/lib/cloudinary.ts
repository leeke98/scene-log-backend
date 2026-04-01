import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function extractPublicId(url: string): string | null {
  // https://res.cloudinary.com/cloud/image/upload/v123456/public_id.jpg
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
  return match ? match[1] : null;
}

export async function deleteCloudinaryImage(url: string): Promise<void> {
  if (!url.includes("res.cloudinary.com")) return;

  const publicId = extractPublicId(url);
  if (!publicId) return;

  await cloudinary.uploader.destroy(publicId);
}
