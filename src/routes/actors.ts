import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { authenticateAdmin } from "../middleware/auth";
import { parseActorDomain, formatActorDomain } from "../lib/utils";
import { ActorDomain, ActorStatus } from "@prisma/client";

const router = Router();

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

const formatActorBasic = (actor: {
  id: string;
  name: string;
  birthYear: number | null;
  domain: ActorDomain | null;
  status: ActorStatus;
}) => ({
  id: actor.id,
  name: actor.name,
  birthYear: actor.birthYear,
  domain: formatActorDomain(actor.domain),
  status: actor.status,
});

// ─── 배우 검색 ─────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/actors/search:
 *   get:
 *     summary: 배우 검색
 *     tags: [Actors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: 검색어 (이름 부분 일치)
 *     responses:
 *       200:
 *         description: 배우 목록
 */
router.get("/actors/search", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { q } = req.query;

    if (!q || typeof q !== "string") {
      res.status(400).json({ error: "검색어(q)가 필요합니다.", code: "MISSING_QUERY" });
      return;
    }

    const actors = await prisma.actor.findMany({
      where: {
        name: { contains: q },
        status: { not: ActorStatus.merged },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        birthYear: true,
        domain: true,
        status: true,
        ticketActors: {
          where: { ticket: { userId } },
          select: { ticket: { select: { performanceName: true } } },
        },
      },
    });

    // verified 상단 정렬 (unverified < verified 알파벳 순이므로 asc가 unverified 먼저)
    // status: verified → unverified 순으로 정렬해야 하므로 수동 정렬
    const sorted = actors.sort((a, b) => {
      if (a.status === ActorStatus.verified && b.status !== ActorStatus.verified) return -1;
      if (a.status !== ActorStatus.verified && b.status === ActorStatus.verified) return 1;
      return a.name.localeCompare(b.name);
    });

    const data = sorted.map((actor) => {
      const allPerformances = actor.ticketActors.map((ta) => ta.ticket.performanceName);
      const uniquePerformances = [...new Set(allPerformances)].slice(0, 5);
      return {
        ...formatActorBasic(actor),
        performances: uniquePerformances,
      };
    });

    res.json({ data });
  } catch (error) {
    console.error("배우 검색 오류:", error);
    res.status(500).json({ error: "배우 검색 중 오류가 발생했습니다.", code: "SEARCH_ACTORS_ERROR" });
  }
});

// ─── 배우 등록 ─────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/actors:
 *   post:
 *     summary: 배우 등록
 *     tags: [Actors]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               birthYear:
 *                 type: integer
 *               domain:
 *                 type: string
 *                 enum: [뮤지컬, 연극, 클래식, 기타]
 *     responses:
 *       201:
 *         description: 배우 등록 성공
 *       409:
 *         description: 동일 유저 + 동일 이름 중복
 */
router.post("/actors", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { name, birthYear, domain } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      res.status(400).json({ error: "name은 필수입니다.", code: "MISSING_FIELDS" });
      return;
    }

    // 동일 유저 + 동일 이름 중복 확인
    const existing = await prisma.actor.findFirst({
      where: { name: name.trim(), createdBy: userId },
      include: {
        ticketActors: {
          where: { ticket: { userId } },
          select: { ticket: { select: { performanceName: true } } },
          take: 5,
        },
      },
    });

    if (existing) {
      const performances = [...new Set(existing.ticketActors.map((ta) => ta.ticket.performanceName))];
      res.status(409).json({
        message: "이미 등록된 배우입니다.",
        existingActor: {
          id: existing.id,
          name: existing.name,
          domain: formatActorDomain(existing.domain),
          performances,
        },
      });
      return;
    }

    const parsedDomain = domain ? parseActorDomain(domain) : null;

    const actor = await prisma.actor.create({
      data: {
        name: name.trim(),
        birthYear: birthYear ?? null,
        domain: parsedDomain,
        status: ActorStatus.unverified,
        createdBy: userId,
      },
    });

    res.status(201).json(formatActorBasic(actor));
  } catch (error) {
    console.error("배우 등록 오류:", error);
    res.status(500).json({ error: "배우 등록 중 오류가 발생했습니다.", code: "CREATE_ACTOR_ERROR" });
  }
});

// ─── 배우 수정 ─────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/actors/{id}:
 *   put:
 *     summary: 배우 수정
 *     tags: [Actors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 수정 성공
 *       403:
 *         description: 수정 권한 없음
 *       404:
 *         description: 배우를 찾을 수 없음
 */
router.put("/actors/:id", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { name, birthYear, domain } = req.body;

    const actor = await prisma.actor.findUnique({ where: { id } });
    if (!actor) {
      res.status(404).json({ error: "배우를 찾을 수 없습니다.", code: "ACTOR_NOT_FOUND" });
      return;
    }

    if (actor.status !== ActorStatus.unverified || actor.createdBy !== userId) {
      res.status(403).json({ error: "수정 권한이 없습니다.", code: "FORBIDDEN" });
      return;
    }

    const updated = await prisma.actor.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(birthYear !== undefined && { birthYear }),
        ...(domain !== undefined && { domain: parseActorDomain(domain) }),
      },
    });

    res.json(formatActorBasic(updated));
  } catch (error) {
    console.error("배우 수정 오류:", error);
    res.status(500).json({ error: "배우 수정 중 오류가 발생했습니다.", code: "UPDATE_ACTOR_ERROR" });
  }
});

// ─── 배우 신고 ─────────────────────────────────────────────────────────────────

const VALID_REASONS = ["이름이 잘못됨", "이미지가 다른 사람임", "중복 배우 존재함", "기타"];

/**
 * @openapi
 * /api/actors/{id}/report:
 *   post:
 *     summary: 배우 신고
 *     tags: [Actors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *               duplicateActorId:
 *                 type: string
 *     responses:
 *       201:
 *         description: 신고 접수
 *       404:
 *         description: 배우를 찾을 수 없음
 */
router.post("/actors/:id/report", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { reason, duplicateActorId } = req.body;

    if (!reason || !VALID_REASONS.includes(reason)) {
      res.status(400).json({
        error: `reason은 다음 중 하나여야 합니다: ${VALID_REASONS.join(", ")}`,
        code: "INVALID_REASON",
      });
      return;
    }

    const actor = await prisma.actor.findUnique({ where: { id } });
    if (!actor) {
      res.status(404).json({ error: "배우를 찾을 수 없습니다.", code: "ACTOR_NOT_FOUND" });
      return;
    }

    await prisma.actorReport.create({
      data: {
        actorId: id,
        reportedBy: userId,
        reason,
        duplicateActorId: reason === "중복 배우 존재함" ? duplicateActorId ?? null : null,
      },
    });

    res.status(201).json({ message: "신고가 접수되었습니다." });
  } catch (error) {
    console.error("배우 신고 오류:", error);
    res.status(500).json({ error: "배우 신고 중 오류가 발생했습니다.", code: "REPORT_ACTOR_ERROR" });
  }
});

// ─── [어드민] 배우 검증 ────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/admin/actors/{id}/verify:
 *   put:
 *     summary: "[어드민] 배우 검증"
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 검증 완료
 *       404:
 *         description: 배우를 찾을 수 없음
 */
router.put("/admin/actors/:id/verify", authenticateAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const actor = await prisma.actor.findUnique({ where: { id } });
    if (!actor) {
      res.status(404).json({ error: "배우를 찾을 수 없습니다.", code: "ACTOR_NOT_FOUND" });
      return;
    }

    if (actor.status !== ActorStatus.unverified) {
      res.status(400).json({ error: "unverified 상태의 배우만 검증할 수 있습니다.", code: "INVALID_STATUS" });
      return;
    }

    await prisma.actor.update({ where: { id }, data: { status: ActorStatus.verified } });

    res.json({ message: "검증 완료", id, status: "verified" });
  } catch (error) {
    console.error("배우 검증 오류:", error);
    res.status(500).json({ error: "배우 검증 중 오류가 발생했습니다.", code: "VERIFY_ACTOR_ERROR" });
  }
});

// ─── [어드민] 배우 merge ───────────────────────────────────────────────────────

/**
 * @openapi
 * /api/admin/actors/merge:
 *   post:
 *     summary: "[어드민] 배우 merge"
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sourceId, targetId]
 *             properties:
 *               sourceId:
 *                 type: string
 *               targetId:
 *                 type: string
 *     responses:
 *       200:
 *         description: merge 완료
 *       400:
 *         description: source = target이거나 잘못된 요청
 *       404:
 *         description: 배우를 찾을 수 없음
 */
router.post("/admin/actors/merge", authenticateAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { sourceId, targetId } = req.body;

    if (!sourceId || !targetId) {
      res.status(400).json({ error: "sourceId와 targetId가 필요합니다.", code: "MISSING_FIELDS" });
      return;
    }

    if (sourceId === targetId) {
      res.status(400).json({ error: "source와 target이 같을 수 없습니다.", code: "SAME_ACTOR" });
      return;
    }

    const [source, target] = await Promise.all([
      prisma.actor.findUnique({ where: { id: sourceId } }),
      prisma.actor.findUnique({ where: { id: targetId } }),
    ]);

    if (!source) {
      res.status(404).json({ error: "source 배우를 찾을 수 없습니다.", code: "ACTOR_NOT_FOUND" });
      return;
    }
    if (!target) {
      res.status(404).json({ error: "target 배우를 찾을 수 없습니다.", code: "ACTOR_NOT_FOUND" });
      return;
    }

    // sourceId를 가리키는 ticket_actors를 targetId로 업데이트
    // 단, (ticketId, targetId) 중복이 생기는 경우 해당 row는 삭제
    const sourceTicketActors = await prisma.ticketActor.findMany({
      where: { actorId: sourceId },
      select: { ticketId: true },
    });

    const existingTargetTicketIds = new Set(
      (await prisma.ticketActor.findMany({ where: { actorId: targetId }, select: { ticketId: true } })).map(
        (ta) => ta.ticketId
      )
    );

    const ticketIdsToUpdate = sourceTicketActors
      .map((ta) => ta.ticketId)
      .filter((ticketId) => !existingTargetTicketIds.has(ticketId));

    const ticketIdsToDelete = sourceTicketActors
      .map((ta) => ta.ticketId)
      .filter((ticketId) => existingTargetTicketIds.has(ticketId));

    await prisma.$transaction([
      // 중복 없는 row → targetId로 변경
      ...ticketIdsToUpdate.map((ticketId) =>
        prisma.ticketActor.update({
          where: { ticketId_actorId: { ticketId, actorId: sourceId } },
          data: { actorId: targetId },
        })
      ),
      // 중복 있는 row → 삭제
      ...(ticketIdsToDelete.length > 0
        ? [prisma.ticketActor.deleteMany({ where: { actorId: sourceId, ticketId: { in: ticketIdsToDelete } } })]
        : []),
      // source actor → merged 처리
      prisma.actor.update({
        where: { id: sourceId },
        data: { status: ActorStatus.merged, canonicalId: targetId },
      }),
    ]);

    const mergedCount = ticketIdsToUpdate.length + ticketIdsToDelete.length;

    res.json({
      message: "merge 완료",
      canonical: { id: target.id, name: target.name },
      mergedCount,
    });
  } catch (error) {
    console.error("배우 merge 오류:", error);
    res.status(500).json({ error: "배우 merge 중 오류가 발생했습니다.", code: "MERGE_ACTOR_ERROR" });
  }
});

export default router;
