import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";

const router = Router();

router.use(authenticate);

/**
 * GET /api/marks
 * 현재 유저의 위시리스트 전체 조회
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const marks = await prisma.userPerformanceMark.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: marks });
  } catch (error) {
    console.error("위시리스트 조회 오류:", error);
    res.status(500).json({ error: "위시리스트 조회에 실패했습니다." });
  }
});

/**
 * POST /api/marks
 * 위시리스트에 공연 추가
 * body: { kopisId, title, posterUrl?, startDate?, endDate?, venue? }
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { kopisId, title, posterUrl, startDate, endDate, venue } = req.body;

  if (!kopisId || !title) {
    res.status(400).json({ error: "kopisId와 title은 필수입니다." });
    return;
  }

  try {
    const mark = await prisma.userPerformanceMark.create({
      data: {
        userId: req.userId!,
        kopisId,
        title,
        posterUrl: posterUrl ?? null,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        venue: venue ?? null,
      },
    });
    res.status(201).json({ data: mark });
  } catch (error: unknown) {
    // unique constraint 위반 (이미 저장됨)
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "이미 위시리스트에 저장된 공연입니다." });
      return;
    }
    console.error("위시리스트 추가 오류:", error);
    res.status(500).json({ error: "위시리스트 추가에 실패했습니다." });
  }
});

/**
 * DELETE /api/marks/:kopisId
 * 위시리스트에서 공연 제거
 */
router.delete("/:kopisId", async (req: Request, res: Response): Promise<void> => {
  const { kopisId } = req.params;

  try {
    await prisma.userPerformanceMark.delete({
      where: {
        userId_kopisId: {
          userId: req.userId!,
          kopisId,
        },
      },
    });
    res.json({ message: "위시리스트에서 제거되었습니다." });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2025"
    ) {
      res.status(404).json({ error: "위시리스트에 없는 공연입니다." });
      return;
    }
    console.error("위시리스트 제거 오류:", error);
    res.status(500).json({ error: "위시리스트 제거에 실패했습니다." });
  }
});

export default router;
