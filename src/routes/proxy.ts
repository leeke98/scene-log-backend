import { Router, Request, Response } from "express";

const router = Router();

const ALLOWED_ORIGIN = "http://www.kopis.or.kr/";

/**
 * @openapi
 * /api/proxy/image:
 *   get:
 *     summary: KOPIS 포스터 이미지 프록시
 *     description: CORS 제한을 우회하기 위해 KOPIS 도메인의 이미지를 프록시합니다.
 *     tags: [Proxy]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: 프록시할 이미지 URL (http://www.kopis.or.kr/ 도메인만 허용)
 *     responses:
 *       200:
 *         description: 이미지 바이너리 응답
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: url 파라미터 누락
 *       403:
 *         description: 허용되지 않는 도메인
 *       502:
 *         description: 이미지 가져오기 실패
 */
router.get("/image", async (req: Request, res: Response): Promise<void> => {
  const { url } = req.query;

  if (!url || typeof url !== "string") {
    res.status(400).json({
      error: "url 파라미터가 필요합니다.",
      code: "MISSING_URL",
    });
    return;
  }

  if (!url.startsWith(ALLOWED_ORIGIN)) {
    res.status(403).json({
      error: "허용되지 않는 도메인입니다.",
      code: "FORBIDDEN_DOMAIN",
    });
    return;
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      res.status(502).json({
        error: "이미지를 가져오는데 실패했습니다.",
        code: "IMAGE_FETCH_FAILED",
      });
      return;
    }

    const contentType = response.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (error) {
    console.error("이미지 프록시 오류:", error);
    res.status(502).json({
      error: "이미지를 가져오는데 실패했습니다.",
      code: "IMAGE_FETCH_FAILED",
    });
  }
});

export default router;
