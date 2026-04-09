import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/auth";
import { formatActorDomain, buildReportDateFilter, buildGenreFilter, parsePagination, isPaginationError } from "../../lib/utils";

const router = Router();

// 모든 리포트 라우트는 인증 필요
router.use(authenticate);

/**
 * @openapi
 * /api/reports/actors:
 *   get:
 *     summary: 배우별 통계
 *     description: >
 *       연도별, 월별, 임의 기간별, 또는 전체 누적 데이터를 조회할 수 있습니다.
 *       startDate/endDate가 있으면 year/month는 무시됩니다.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: "배우명 검색"
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 시작일 (YYYY-MM-DD). 지정 시 year/month 무시"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 종료일 (YYYY-MM-DD). 지정 시 year/month 무시"
 *       - in: query
 *         name: year
 *         schema:
 *           type: string
 *         description: "연도 (예: 2024). startDate/endDate가 없을 때 사용"
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *         description: "월 (year와 함께 사용, 예: 01, 02, ..., 12)"
 *       - in: query
 *         name: genre
 *         schema:
 *           type: string
 *           enum: [뮤지컬, 연극]
 *         description: "장르 필터 (없으면 전체)"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *     responses:
 *       200:
 *         description: "배우별 통계 데이터"
 *       401:
 *         description: "인증 실패"
 */
router.get("/actors", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { search, year, month, startDate, endDate, genre, page, limit } = req.query;

    const pagination = parsePagination(page, limit, 20);
    if (isPaginationError(pagination)) {
      res.status(400).json(pagination);
      return;
    }
    const { pageNum, limitNum } = pagination;

    const dateFilter = buildReportDateFilter({
      year: year as string,
      month: month as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });
    if (dateFilter === null) {
      res.status(400).json(
        startDate || endDate
          ? { error: "날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식으로 입력해주세요.", code: "INVALID_DATE" }
          : { error: "월은 1-12 사이의 값이어야 합니다.", code: "INVALID_MONTH" }
      );
      return;
    }

    const genreFilter = buildGenreFilter(genre as string);
    if (genreFilter === null) {
      res.status(400).json({ error: "장르는 '뮤지컬' 또는 '연극'이어야 합니다.", code: "INVALID_GENRE" });
      return;
    }

    const ticketFilter = { userId, ...dateFilter, ...genreFilter };

    // Step 1: 배우별 관람 횟수 집계
    const actorCounts = await prisma.ticketActor.groupBy({
      by: ["actorId"],
      where: {
        ticket: ticketFilter,
        ...(search ? { actor: { name: { contains: search as string } } } : {}),
      },
      _count: { actorId: true },
      orderBy: { _count: { actorId: "desc" } },
    });

    const total = actorCounts.length;
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedCounts = actorCounts.slice(startIndex, startIndex + limitNum);

    if (paginatedCounts.length === 0) {
      res.json({
        data: [],
        pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
      });
      return;
    }

    // Step 2: 현재 페이지 배우들의 상세 정보 조회
    const actorIds = paginatedCounts.map((g) => g.actorId);

    const [actorDetails, ticketActors, userActorImages] = await Promise.all([
      prisma.actor.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, domain: true, status: true },
      }),
      prisma.ticketActor.findMany({
        where: { actorId: { in: actorIds }, ticket: ticketFilter },
        select: {
          actorId: true,
          ticket: { select: { ticketPrice: true, performanceName: true } },
        },
      }),
      prisma.userActorImage.findMany({
        where: { userId, actorId: { in: actorIds } },
        select: { actorId: true, imageUrl: true },
      }),
    ]);

    const actorMap = new Map(actorDetails.map((a) => [a.id, a]));
    const imageMap = new Map(userActorImages.map((img) => [img.actorId, img.imageUrl]));

    const detailMap: Record<string, { totalTicketPrice: number; performances: Set<string> }> = {};
    ticketActors.forEach((ta) => {
      const id = ta.actorId;
      if (!detailMap[id]) {
        detailMap[id] = { totalTicketPrice: 0, performances: new Set() };
      }
      detailMap[id].totalTicketPrice += ta.ticket.ticketPrice;
      detailMap[id].performances.add(ta.ticket.performanceName);
    });

    const data = paginatedCounts.map((group) => {
      const actor = actorMap.get(group.actorId);
      return {
        actorId: group.actorId,
        actorName: actor?.name ?? "",
        domain: formatActorDomain(actor?.domain ?? null),
        status: actor?.status,
        viewCount: group._count.actorId,
        totalTicketPrice: detailMap[group.actorId]?.totalTicketPrice ?? 0,
        uniquePerformances: detailMap[group.actorId]?.performances.size ?? 0,
        performanceList: Array.from(detailMap[group.actorId]?.performances ?? []),
        imageUrl: imageMap.get(group.actorId) ?? null,
      };
    });

    res.json({
      data,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("배우별 통계 오류:", error);
    res.status(500).json({
      error: "배우별 통계를 가져오는 중 오류가 발생했습니다.",
      code: "GET_ACTORS_ERROR",
    });
  }
});

/**
 * @openapi
 * /api/reports/actors/{actorId}:
 *   get:
 *     summary: 배우 상세 정보
 *     description: >
 *       연도별, 월별, 임의 기간별, 또는 전체 누적 데이터를 조회할 수 있습니다.
 *       startDate/endDate가 있으면 year/month는 무시됩니다.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: actorId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: "배우 ID"
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: year
 *         schema:
 *           type: string
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *       - in: query
 *         name: genre
 *         schema:
 *           type: string
 *           enum: [뮤지컬, 연극]
 *     responses:
 *       200:
 *         description: "배우 상세 정보 및 티켓 목록"
 *       404:
 *         description: "배우를 찾을 수 없습니다"
 *       401:
 *         description: "인증 실패"
 */
router.get("/actors/:actorId", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { actorId } = req.params;
    const { year, month, startDate, endDate, genre } = req.query;

    const dateFilter = buildReportDateFilter({
      year: year as string,
      month: month as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });
    if (dateFilter === null) {
      res.status(400).json(
        startDate || endDate
          ? { error: "날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식으로 입력해주세요.", code: "INVALID_DATE" }
          : { error: "월은 1-12 사이의 값이어야 합니다.", code: "INVALID_MONTH" }
      );
      return;
    }

    const genreFilter = buildGenreFilter(genre as string);
    if (genreFilter === null) {
      res.status(400).json({ error: "장르는 '뮤지컬' 또는 '연극'이어야 합니다.", code: "INVALID_GENRE" });
      return;
    }

    const [actor, ticketActors, userActorImage] = await Promise.all([
      prisma.actor.findUnique({
        where: { id: actorId },
        select: { id: true, name: true, domain: true, status: true },
      }),
      prisma.ticketActor.findMany({
        where: {
          actorId,
          ticket: { userId, ...dateFilter, ...genreFilter },
        },
        select: {
          ticket: {
            select: {
              id: true,
              date: true,
              performanceName: true,
              theater: true,
              seat: true,
              rating: true,
              posterUrl: true,
              ticketPrice: true,
            },
          },
        },
      }),
      prisma.userActorImage.findUnique({
        where: { userId_actorId: { userId, actorId } },
        select: { imageUrl: true },
      }),
    ]);

    if (!actor || ticketActors.length === 0) {
      res.status(404).json({ error: "배우를 찾을 수 없습니다.", code: "ACTOR_NOT_FOUND" });
      return;
    }

    const performances = new Set<string>();
    let totalTicketPrice = 0;
    ticketActors.forEach((ta) => {
      performances.add(ta.ticket.performanceName);
      totalTicketPrice += ta.ticket.ticketPrice;
    });

    const actorStat = {
      actorId: actor.id,
      actorName: actor.name,
      domain: formatActorDomain(actor.domain),
      status: actor.status,
      viewCount: ticketActors.length,
      totalTicketPrice,
      uniquePerformances: performances.size,
      performanceList: Array.from(performances),
      imageUrl: userActorImage?.imageUrl ?? null,
    };

    const tickets = ticketActors
      .map((ta) => ({
        id: ta.ticket.id,
        date: ta.ticket.date.toISOString().split("T")[0],
        performanceName: ta.ticket.performanceName,
        theater: ta.ticket.theater,
        seat: ta.ticket.seat,
        rating: ta.ticket.rating,
        posterUrl: ta.ticket.posterUrl,
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({ actor: actorStat, tickets });
  } catch (error) {
    console.error("배우 상세 정보 오류:", error);
    res.status(500).json({
      error: "배우 상세 정보를 가져오는 중 오류가 발생했습니다.",
      code: "GET_ACTOR_DETAIL_ERROR",
    });
  }
});

export default router;
