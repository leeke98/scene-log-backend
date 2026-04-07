import { Router, Request, Response } from "express";
import { Prisma, RewatchRewardType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

/** 시즌이 현재 유저 소유인지 확인 */
async function findOwnedSeason(seasonId: string, userId: string) {
  return prisma.rewatchSeason.findFirst({ where: { id: seasonId, userId } });
}

/** 카드가 현재 유저 소유인지 확인 (시즌→userId 검증) */
async function findOwnedCard(cardId: string, userId: string) {
  return prisma.rewatchCard.findFirst({
    where: { id: cardId, season: { userId } },
  });
}

/** 마일스톤이 현재 유저 소유인지 확인 */
async function findOwnedMilestone(milestoneId: string, userId: string) {
  return prisma.rewatchMilestone.findFirst({
    where: { id: milestoneId, season: { userId } },
  });
}

/** 혜택이 현재 유저 소유인지 확인 */
async function findOwnedReward(rewardId: string, userId: string) {
  return prisma.rewatchMilestoneReward.findFirst({
    where: { id: rewardId, milestone: { season: { userId } } },
  });
}

// ─── 시즌 ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/rewatch/seasons
 * 내 시즌 목록 (카드 수, 총 스탬프 수 포함)
 */
router.get("/seasons", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const seasons = await prisma.rewatchSeason.findMany({
      where: { userId },
      include: {
        milestones: {
          orderBy: { stampCount: "asc" },
          include: { rewards: { orderBy: { createdAt: "asc" } } },
        },
        cards: {
          include: {
            cardTickets: { select: { stampCount: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = seasons.map((season) => {
      const cards = season.cards.map((card) => ({
        id: card.id,
        label: card.label,
        totalStamps: card.cardTickets.reduce((sum, ct) => sum + ct.stampCount, 0),
        ticketCount: card.cardTickets.length,
      }));

      return {
        id: season.id,
        mt20id: season.mt20id,
        title: season.title,
        posterUrl: season.posterUrl,
        startDate: season.startDate,
        endDate: season.endDate,
        venue: season.venue,
        createdAt: season.createdAt,
        milestones: season.milestones.map((m) => ({
          id: m.id,
          stampCount: m.stampCount,
          rewards: m.rewards.map((r) => ({
            id: r.id,
            rewardType: r.rewardType,
            discountPercent: r.discountPercent,
            voucherQty: r.voucherQty,
            merchandiseDesc: r.merchandiseDesc,
          })),
        })),
        cards,
        cardCount: cards.length,
      };
    });

    res.json({ data });
  } catch (error) {
    console.error("시즌 목록 조회 오류:", error);
    res.status(500).json({ error: "시즌 목록 조회에 실패했습니다.", code: "GET_SEASONS_ERROR" });
  }
});

/**
 * POST /api/rewatch/seasons
 * 시즌 생성. mt20id가 이미 있으면 409 반환
 * body: { mt20id, title, posterUrl?, startDate?, endDate?, venue? }
 */
router.post("/seasons", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { mt20id, title, posterUrl, startDate, endDate, venue } = req.body;

    if (!mt20id || !title) {
      res.status(400).json({ error: "mt20id와 title은 필수입니다.", code: "MISSING_FIELDS" });
      return;
    }

    const season = await prisma.rewatchSeason.create({
      data: {
        userId,
        mt20id,
        title,
        posterUrl: posterUrl ?? null,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        venue: venue ?? null,
      },
    });

    res.status(201).json({ data: season });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      res.status(409).json({ error: "이미 등록된 공연 시즌입니다.", code: "SEASON_ALREADY_EXISTS" });
      return;
    }
    console.error("시즌 생성 오류:", error);
    res.status(500).json({ error: "시즌 생성에 실패했습니다.", code: "CREATE_SEASON_ERROR" });
  }
});

/**
 * GET /api/rewatch/seasons/:seasonId
 * 시즌 상세 (마일스톤+혜택, 카드, 스탬프, 달성 여부 포함)
 */
router.get("/seasons/:seasonId", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { seasonId } = req.params;

    const season = await prisma.rewatchSeason.findFirst({
      where: { id: seasonId, userId },
      include: {
        milestones: {
          orderBy: { stampCount: "asc" },
          include: { rewards: { orderBy: { createdAt: "asc" } } },
        },
        cards: {
          orderBy: { createdAt: "asc" },
          include: {
            cardTickets: {
              orderBy: { addedAt: "asc" },
              include: {
                ticket: {
                  select: {
                    id: true,
                    performanceName: true,
                    date: true,
                    time: true,
                    theater: true,
                    posterUrl: true,
                  },
                },
              },
            },
            voucherUsages: {
              select: { id: true, rewardId: true, ticketId: true, usedAt: true },
            },
            merchandiseReceipts: {
              select: { id: true, rewardId: true, received: true, receivedAt: true },
            },
          },
        },
      },
    });

    if (!season) {
      res.status(404).json({ error: "시즌을 찾을 수 없습니다.", code: "SEASON_NOT_FOUND" });
      return;
    }

    const cards = season.cards.map((card) => {
      const totalStamps = card.cardTickets.reduce((sum, ct) => sum + ct.stampCount, 0);

      const milestoneStatuses = season.milestones.map((m) => {
        const achieved = totalStamps >= m.stampCount;

        const rewardStatuses = m.rewards.map((r) => {
          if (r.rewardType === RewatchRewardType.DISCOUNT_VOUCHER) {
            const usages = card.voucherUsages.filter((u) => u.rewardId === r.id);
            const remaining = (r.voucherQty ?? 1) - usages.length;
            return {
              rewardId: r.id,
              rewardType: r.rewardType,
              discountPercent: r.discountPercent,
              voucherQty: r.voucherQty,
              voucherUsed: usages.length,
              voucherRemaining: remaining,
              usages: usages.map((u) => ({ id: u.id, ticketId: u.ticketId, usedAt: u.usedAt })),
            };
          } else {
            const receipt = card.merchandiseReceipts.find((rec) => rec.rewardId === r.id);
            return {
              rewardId: r.id,
              rewardType: r.rewardType,
              merchandiseDesc: r.merchandiseDesc,
              merchandiseReceiptId: receipt?.id ?? null,
              merchandiseReceived: receipt?.received ?? false,
              merchandiseReceivedAt: receipt?.receivedAt ?? null,
            };
          }
        });

        return {
          milestoneId: m.id,
          achieved,
          rewardStatuses,
        };
      });

      return {
        id: card.id,
        label: card.label,
        totalStamps,
        ticketCount: card.cardTickets.length,
        createdAt: card.createdAt,
        tickets: card.cardTickets.map((ct) => ({
          id: ct.id,
          ticketId: ct.ticketId,
          stampCount: ct.stampCount,
          addedAt: ct.addedAt,
          performanceName: ct.ticket.performanceName,
          date: ct.ticket.date,
          time: ct.ticket.time,
          theater: ct.ticket.theater,
          posterUrl: ct.ticket.posterUrl,
        })),
        milestoneStatuses,
      };
    });

    res.json({
      data: {
        id: season.id,
        mt20id: season.mt20id,
        title: season.title,
        posterUrl: season.posterUrl,
        startDate: season.startDate,
        endDate: season.endDate,
        venue: season.venue,
        createdAt: season.createdAt,
        milestones: season.milestones.map((m) => ({
          id: m.id,
          stampCount: m.stampCount,
          createdAt: m.createdAt,
          rewards: m.rewards.map((r) => ({
            id: r.id,
            rewardType: r.rewardType,
            discountPercent: r.discountPercent,
            voucherQty: r.voucherQty,
            merchandiseDesc: r.merchandiseDesc,
          })),
        })),
        cards,
      },
    });
  } catch (error) {
    console.error("시즌 상세 조회 오류:", error);
    res.status(500).json({ error: "시즌 조회에 실패했습니다.", code: "GET_SEASON_ERROR" });
  }
});

/**
 * DELETE /api/rewatch/seasons/:seasonId
 * 시즌 삭제 (cascade로 하위 데이터 모두 삭제)
 */
router.delete("/seasons/:seasonId", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { seasonId } = req.params;

    const season = await findOwnedSeason(seasonId, userId);
    if (!season) {
      res.status(404).json({ error: "시즌을 찾을 수 없습니다.", code: "SEASON_NOT_FOUND" });
      return;
    }

    await prisma.rewatchSeason.delete({ where: { id: seasonId } });
    res.json({ message: "시즌이 삭제되었습니다." });
  } catch (error) {
    console.error("시즌 삭제 오류:", error);
    res.status(500).json({ error: "시즌 삭제에 실패했습니다.", code: "DELETE_SEASON_ERROR" });
  }
});

// ─── 마일스톤 ─────────────────────────────────────────────────────────────────

/**
 * POST /api/rewatch/seasons/:seasonId/milestones
 * 마일스톤 추가 (혜택 배열 포함)
 * body: { stampCount, rewards: Array<{ rewardType, discountPercent?, voucherQty?, merchandiseDesc? }> }
 */
router.post(
  "/seasons/:seasonId/milestones",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { seasonId } = req.params;
      const { stampCount, rewards } = req.body;

      if (!stampCount) {
        res.status(400).json({ error: "stampCount는 필수입니다.", code: "MISSING_FIELDS" });
        return;
      }

      if (!Array.isArray(rewards) || rewards.length === 0) {
        res.status(400).json({ error: "rewards는 1개 이상이어야 합니다.", code: "MISSING_REWARDS" });
        return;
      }

      for (const r of rewards) {
        if (!Object.values(RewatchRewardType).includes(r.rewardType)) {
          res.status(400).json({ error: "rewardType이 올바르지 않습니다.", code: "INVALID_REWARD_TYPE" });
          return;
        }
      }

      const season = await findOwnedSeason(seasonId, userId);
      if (!season) {
        res.status(404).json({ error: "시즌을 찾을 수 없습니다.", code: "SEASON_NOT_FOUND" });
        return;
      }

      const milestone = await prisma.rewatchMilestone.create({
        data: {
          seasonId,
          stampCount,
          rewards: {
            create: rewards.map((r: { rewardType: RewatchRewardType; discountPercent?: number; voucherQty?: number; merchandiseDesc?: string }) => ({
              rewardType: r.rewardType,
              discountPercent: r.discountPercent ?? null,
              voucherQty: r.voucherQty ?? 1,
              merchandiseDesc: r.merchandiseDesc ?? null,
            })),
          },
        },
        include: { rewards: { orderBy: { createdAt: "asc" } } },
      });

      res.status(201).json({ data: milestone });
    } catch (error) {
      console.error("마일스톤 생성 오류:", error);
      res.status(500).json({ error: "마일스톤 생성에 실패했습니다.", code: "CREATE_MILESTONE_ERROR" });
    }
  }
);

/**
 * PUT /api/rewatch/milestones/:milestoneId
 * 마일스톤 stampCount 수정
 * body: { stampCount }
 */
router.put(
  "/milestones/:milestoneId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { milestoneId } = req.params;

      const milestone = await findOwnedMilestone(milestoneId, userId);
      if (!milestone) {
        res.status(404).json({ error: "마일스톤을 찾을 수 없습니다.", code: "MILESTONE_NOT_FOUND" });
        return;
      }

      const updateData: Prisma.RewatchMilestoneUpdateInput = {};
      if (req.body.stampCount !== undefined) updateData.stampCount = req.body.stampCount;

      const updated = await prisma.rewatchMilestone.update({
        where: { id: milestoneId },
        data: updateData,
        include: { rewards: { orderBy: { createdAt: "asc" } } },
      });

      res.json({ data: updated });
    } catch (error) {
      console.error("마일스톤 수정 오류:", error);
      res.status(500).json({ error: "마일스톤 수정에 실패했습니다.", code: "UPDATE_MILESTONE_ERROR" });
    }
  }
);

/**
 * DELETE /api/rewatch/milestones/:milestoneId
 * 마일스톤 삭제 (cascade로 혜택/사용이력 모두 삭제)
 */
router.delete(
  "/milestones/:milestoneId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { milestoneId } = req.params;

      const milestone = await findOwnedMilestone(milestoneId, userId);
      if (!milestone) {
        res.status(404).json({ error: "마일스톤을 찾을 수 없습니다.", code: "MILESTONE_NOT_FOUND" });
        return;
      }

      await prisma.rewatchMilestone.delete({ where: { id: milestoneId } });
      res.json({ message: "마일스톤이 삭제되었습니다." });
    } catch (error) {
      console.error("마일스톤 삭제 오류:", error);
      res.status(500).json({ error: "마일스톤 삭제에 실패했습니다.", code: "DELETE_MILESTONE_ERROR" });
    }
  }
);

// ─── 마일스톤 혜택 ────────────────────────────────────────────────────────────

/**
 * POST /api/rewatch/milestones/:milestoneId/rewards
 * 혜택 추가
 * body: { rewardType, discountPercent?, voucherQty?, merchandiseDesc? }
 */
router.post(
  "/milestones/:milestoneId/rewards",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { milestoneId } = req.params;
      const { rewardType, discountPercent, voucherQty, merchandiseDesc } = req.body;

      if (!rewardType || !Object.values(RewatchRewardType).includes(rewardType)) {
        res.status(400).json({ error: "rewardType이 올바르지 않습니다.", code: "INVALID_REWARD_TYPE" });
        return;
      }

      const milestone = await findOwnedMilestone(milestoneId, userId);
      if (!milestone) {
        res.status(404).json({ error: "마일스톤을 찾을 수 없습니다.", code: "MILESTONE_NOT_FOUND" });
        return;
      }

      const reward = await prisma.rewatchMilestoneReward.create({
        data: {
          milestoneId,
          rewardType,
          discountPercent: discountPercent ?? null,
          voucherQty: voucherQty ?? 1,
          merchandiseDesc: merchandiseDesc ?? null,
        },
      });

      res.status(201).json({ data: reward });
    } catch (error) {
      console.error("혜택 추가 오류:", error);
      res.status(500).json({ error: "혜택 추가에 실패했습니다.", code: "CREATE_REWARD_ERROR" });
    }
  }
);

/**
 * PUT /api/rewatch/rewards/:rewardId
 * 혜택 수정
 * body: { discountPercent?, voucherQty?, merchandiseDesc? }
 */
router.put(
  "/rewards/:rewardId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { rewardId } = req.params;

      const reward = await findOwnedReward(rewardId, userId);
      if (!reward) {
        res.status(404).json({ error: "혜택을 찾을 수 없습니다.", code: "REWARD_NOT_FOUND" });
        return;
      }

      const updateData: Prisma.RewatchMilestoneRewardUpdateInput = {};
      const body = req.body;
      if (body.discountPercent !== undefined) updateData.discountPercent = body.discountPercent;
      if (body.voucherQty !== undefined) updateData.voucherQty = body.voucherQty;
      if (body.merchandiseDesc !== undefined) updateData.merchandiseDesc = body.merchandiseDesc;

      const updated = await prisma.rewatchMilestoneReward.update({
        where: { id: rewardId },
        data: updateData,
      });

      res.json({ data: updated });
    } catch (error) {
      console.error("혜택 수정 오류:", error);
      res.status(500).json({ error: "혜택 수정에 실패했습니다.", code: "UPDATE_REWARD_ERROR" });
    }
  }
);

/**
 * DELETE /api/rewatch/rewards/:rewardId
 * 혜택 삭제
 */
router.delete(
  "/rewards/:rewardId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { rewardId } = req.params;

      const reward = await findOwnedReward(rewardId, userId);
      if (!reward) {
        res.status(404).json({ error: "혜택을 찾을 수 없습니다.", code: "REWARD_NOT_FOUND" });
        return;
      }

      await prisma.rewatchMilestoneReward.delete({ where: { id: rewardId } });
      res.json({ message: "혜택이 삭제되었습니다." });
    } catch (error) {
      console.error("혜택 삭제 오류:", error);
      res.status(500).json({ error: "혜택 삭제에 실패했습니다.", code: "DELETE_REWARD_ERROR" });
    }
  }
);

// ─── 카드 ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/rewatch/seasons/:seasonId/cards
 * 카드 인스턴스 생성
 * body: { label? }
 */
router.post(
  "/seasons/:seasonId/cards",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { seasonId } = req.params;
      const { label } = req.body;

      const season = await findOwnedSeason(seasonId, userId);
      if (!season) {
        res.status(404).json({ error: "시즌을 찾을 수 없습니다.", code: "SEASON_NOT_FOUND" });
        return;
      }

      const card = await prisma.rewatchCard.create({
        data: { seasonId, label: label ?? null },
      });

      res.status(201).json({ data: card });
    } catch (error) {
      console.error("카드 생성 오류:", error);
      res.status(500).json({ error: "카드 생성에 실패했습니다.", code: "CREATE_CARD_ERROR" });
    }
  }
);

/**
 * PUT /api/rewatch/cards/:cardId
 * 카드 수정 (label만)
 */
router.put("/cards/:cardId", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { cardId } = req.params;

    const card = await findOwnedCard(cardId, userId);
    if (!card) {
      res.status(404).json({ error: "카드를 찾을 수 없습니다.", code: "CARD_NOT_FOUND" });
      return;
    }

    const updated = await prisma.rewatchCard.update({
      where: { id: cardId },
      data: { label: req.body.label ?? null },
    });

    res.json({ data: updated });
  } catch (error) {
    console.error("카드 수정 오류:", error);
    res.status(500).json({ error: "카드 수정에 실패했습니다.", code: "UPDATE_CARD_ERROR" });
  }
});

/**
 * DELETE /api/rewatch/cards/:cardId
 * 카드 삭제 (cascade로 하위 데이터 삭제)
 */
router.delete("/cards/:cardId", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { cardId } = req.params;

    const card = await findOwnedCard(cardId, userId);
    if (!card) {
      res.status(404).json({ error: "카드를 찾을 수 없습니다.", code: "CARD_NOT_FOUND" });
      return;
    }

    await prisma.rewatchCard.delete({ where: { id: cardId } });
    res.json({ message: "카드가 삭제되었습니다." });
  } catch (error) {
    console.error("카드 삭제 오류:", error);
    res.status(500).json({ error: "카드 삭제에 실패했습니다.", code: "DELETE_CARD_ERROR" });
  }
});

// ─── 카드 티켓 (도장) ─────────────────────────────────────────────────────────

/**
 * POST /api/rewatch/cards/:cardId/tickets
 * 카드에 티켓 추가 (도장 찍기)
 * body: { ticketId, stampCount? }
 */
router.post(
  "/cards/:cardId/tickets",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { cardId } = req.params;
      const { ticketId, stampCount } = req.body;

      if (!ticketId) {
        res.status(400).json({ error: "ticketId는 필수입니다.", code: "MISSING_FIELDS" });
        return;
      }

      const card = await findOwnedCard(cardId, userId);
      if (!card) {
        res.status(404).json({ error: "카드를 찾을 수 없습니다.", code: "CARD_NOT_FOUND" });
        return;
      }

      const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, userId } });
      if (!ticket) {
        res.status(404).json({ error: "티켓을 찾을 수 없습니다.", code: "TICKET_NOT_FOUND" });
        return;
      }

      const cardTicket = await prisma.rewatchCardTicket.create({
        data: {
          cardId,
          ticketId,
          stampCount: stampCount ?? 1,
        },
      });

      res.status(201).json({ data: cardTicket });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        res.status(409).json({ error: "이미 이 카드에 추가된 티켓입니다.", code: "TICKET_ALREADY_ADDED" });
        return;
      }
      console.error("카드 티켓 추가 오류:", error);
      res.status(500).json({ error: "티켓 추가에 실패했습니다.", code: "ADD_CARD_TICKET_ERROR" });
    }
  }
);

/**
 * PATCH /api/rewatch/cards/:cardId/tickets/:ticketId
 * 도장 수 수정
 * body: { stampCount }
 */
router.patch(
  "/cards/:cardId/tickets/:ticketId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { cardId, ticketId } = req.params;
      const { stampCount } = req.body;

      if (stampCount === undefined || stampCount < 1) {
        res.status(400).json({ error: "stampCount는 1 이상이어야 합니다.", code: "INVALID_STAMP_COUNT" });
        return;
      }

      const card = await findOwnedCard(cardId, userId);
      if (!card) {
        res.status(404).json({ error: "카드를 찾을 수 없습니다.", code: "CARD_NOT_FOUND" });
        return;
      }

      const updated = await prisma.rewatchCardTicket.update({
        where: { cardId_ticketId: { cardId, ticketId } },
        data: { stampCount },
      });

      res.json({ data: updated });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        res.status(404).json({ error: "카드에 해당 티켓이 없습니다.", code: "CARD_TICKET_NOT_FOUND" });
        return;
      }
      console.error("도장 수 수정 오류:", error);
      res.status(500).json({ error: "도장 수 수정에 실패했습니다.", code: "UPDATE_STAMP_COUNT_ERROR" });
    }
  }
);

/**
 * DELETE /api/rewatch/cards/:cardId/tickets/:ticketId
 * 카드에서 티켓 제거
 */
router.delete(
  "/cards/:cardId/tickets/:ticketId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { cardId, ticketId } = req.params;

      const card = await findOwnedCard(cardId, userId);
      if (!card) {
        res.status(404).json({ error: "카드를 찾을 수 없습니다.", code: "CARD_NOT_FOUND" });
        return;
      }

      await prisma.rewatchCardTicket.delete({
        where: { cardId_ticketId: { cardId, ticketId } },
      });

      res.json({ message: "티켓이 카드에서 제거되었습니다." });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        res.status(404).json({ error: "카드에 해당 티켓이 없습니다.", code: "CARD_TICKET_NOT_FOUND" });
        return;
      }
      console.error("카드 티켓 제거 오류:", error);
      res.status(500).json({ error: "티켓 제거에 실패했습니다.", code: "REMOVE_CARD_TICKET_ERROR" });
    }
  }
);

// ─── 할인권 사용 ──────────────────────────────────────────────────────────────

/**
 * POST /api/rewatch/cards/:cardId/voucher-usages
 * 할인권 사용 처리
 * body: { rewardId, ticketId }
 */
router.post(
  "/cards/:cardId/voucher-usages",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { cardId } = req.params;
      const { rewardId, ticketId } = req.body;

      if (!rewardId || !ticketId) {
        res.status(400).json({ error: "rewardId와 ticketId는 필수입니다.", code: "MISSING_FIELDS" });
        return;
      }

      const card = await findOwnedCard(cardId, userId);
      if (!card) {
        res.status(404).json({ error: "카드를 찾을 수 없습니다.", code: "CARD_NOT_FOUND" });
        return;
      }

      const reward = await findOwnedReward(rewardId, userId);
      if (!reward) {
        res.status(404).json({ error: "혜택을 찾을 수 없습니다.", code: "REWARD_NOT_FOUND" });
        return;
      }

      // 잔여 수량 확인
      const usedCount = await prisma.rewatchVoucherUsage.count({
        where: { rewardId, cardId },
      });
      if (usedCount >= (reward.voucherQty ?? 1)) {
        res.status(409).json({ error: "할인권 잔여 수량이 없습니다.", code: "VOUCHER_EXHAUSTED" });
        return;
      }

      const usage = await prisma.rewatchVoucherUsage.create({
        data: { rewardId, cardId, ticketId },
      });

      res.status(201).json({ data: usage });
    } catch (error) {
      console.error("할인권 사용 오류:", error);
      res.status(500).json({ error: "할인권 사용 처리에 실패했습니다.", code: "USE_VOUCHER_ERROR" });
    }
  }
);

/**
 * DELETE /api/rewatch/voucher-usages/:usageId
 * 할인권 사용 취소
 */
router.delete(
  "/voucher-usages/:usageId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { usageId } = req.params;

      const usage = await prisma.rewatchVoucherUsage.findFirst({
        where: { id: usageId, card: { season: { userId } } },
      });
      if (!usage) {
        res.status(404).json({ error: "사용 이력을 찾을 수 없습니다.", code: "VOUCHER_USAGE_NOT_FOUND" });
        return;
      }

      await prisma.rewatchVoucherUsage.delete({ where: { id: usageId } });
      res.json({ message: "할인권 사용이 취소되었습니다." });
    } catch (error) {
      console.error("할인권 사용 취소 오류:", error);
      res.status(500).json({ error: "할인권 사용 취소에 실패했습니다.", code: "CANCEL_VOUCHER_ERROR" });
    }
  }
);

// ─── 굿즈 수령 ────────────────────────────────────────────────────────────────

/**
 * PATCH /api/rewatch/cards/:cardId/merchandise-receipts/:rewardId
 * 굿즈 수령 토글 (없으면 생성, 있으면 received 업데이트)
 * body: { received }
 */
router.patch(
  "/cards/:cardId/merchandise-receipts/:rewardId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { cardId, rewardId } = req.params;
      const { received } = req.body;

      if (typeof received !== "boolean") {
        res.status(400).json({ error: "received는 boolean이어야 합니다.", code: "INVALID_RECEIVED" });
        return;
      }

      const card = await findOwnedCard(cardId, userId);
      if (!card) {
        res.status(404).json({ error: "카드를 찾을 수 없습니다.", code: "CARD_NOT_FOUND" });
        return;
      }

      const receipt = await prisma.rewatchMerchandiseReceipt.upsert({
        where: { rewardId_cardId: { rewardId, cardId } },
        create: {
          rewardId,
          cardId,
          received,
          receivedAt: received ? new Date() : null,
        },
        update: {
          received,
          receivedAt: received ? new Date() : null,
        },
      });

      res.json({ data: receipt });
    } catch (error) {
      console.error("굿즈 수령 처리 오류:", error);
      res.status(500).json({ error: "굿즈 수령 처리에 실패했습니다.", code: "UPDATE_MERCHANDISE_ERROR" });
    }
  }
);

export default router;
