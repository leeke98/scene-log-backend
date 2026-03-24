import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/auth";
import {
  buildDateFilter,
  parsePagination,
  isPaginationError,
} from "../../lib/utils";

const router = Router();

// 모든 리포트 라우트는 인증 필요
router.use(authenticate);

/**
 * @openapi
 * /api/reports/actors:
 *   get:
 *     summary: 배우별 통계
 *     description: 연도별, 월별, 또는 전체 누적 데이터를 조회할 수 있습니다.
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
 *         name: year
 *         schema:
 *           type: string
 *         description: "연도 (예: 2024)"
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *         description: "월 (year와 함께 사용, 예: 01, 02, ..., 12)"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: "페이지 번호 (1부터 시작)"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: "페이지당 항목 수"
 *     responses:
 *       200:
 *         description: "배우별 통계 데이터"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       actorName:
 *                         type: string
 *                       viewCount:
 *                         type: integer
 *                       totalTicketPrice:
 *                         type: integer
 *                       uniquePerformances:
 *                         type: integer
 *                       performanceList:
 *                         type: array
 *                         items:
 *                           type: string
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       description: "전체 배우 수"
 *                     page:
 *                       type: integer
 *                       description: "현재 페이지 번호"
 *                     limit:
 *                       type: integer
 *                       description: "페이지당 항목 수"
 *                     totalPages:
 *                       type: integer
 *                       description: "전체 페이지 수"
 *       401:
 *         description: "인증 실패"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/actors", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { search, year, month, page, limit } = req.query;

    const pagination = parsePagination(page, limit, 20);
    if (isPaginationError(pagination)) {
      res.status(400).json(pagination);
      return;
    }
    const { pageNum, limitNum } = pagination;

    const dateFilter = buildDateFilter(year as string, month as string);
    if (dateFilter === null) {
      res.status(400).json({ error: "월은 1-12 사이의 값이어야 합니다.", code: "INVALID_MONTH" });
      return;
    }

    const where: any = {
      ticket: { userId, ...dateFilter },
    };

    if (search) {
      where.actorName = { contains: search as string };
    }

    const castings = await prisma.ticketCasting.findMany({
      where,
      include: {
        ticket: { select: { ticketPrice: true, performanceName: true } },
      },
    });

    // 배우별로 그룹화
    const actorData: Record<
      string,
      { viewCount: number; totalTicketPrice: number; performances: Set<string> }
    > = {};

    castings.forEach((casting) => {
      const name = casting.actorName;
      if (!actorData[name]) {
        actorData[name] = { viewCount: 0, totalTicketPrice: 0, performances: new Set() };
      }
      actorData[name].viewCount++;
      actorData[name].totalTicketPrice += casting.ticket.ticketPrice;
      actorData[name].performances.add(casting.ticket.performanceName);
    });

    const allResults = Object.entries(actorData)
      .map(([actorName, data]) => ({
        actorName,
        viewCount: data.viewCount,
        totalTicketPrice: data.totalTicketPrice,
        uniquePerformances: data.performances.size,
        performanceList: Array.from(data.performances),
      }))
      .sort((a, b) => b.viewCount - a.viewCount);

    const total = allResults.length;
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedResults = allResults.slice(startIndex, startIndex + limitNum);

    res.json({
      data: paginatedResults,
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
 * /api/reports/actors/{actorName}:
 *   get:
 *     summary: 배우 상세 정보
 *     description: 연도별, 월별, 또는 전체 누적 데이터를 조회할 수 있습니다.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: actorName
 *         required: true
 *         schema:
 *           type: string
 *         description: "배우명 (URL 인코딩 필요)"
 *       - in: query
 *         name: year
 *         schema:
 *           type: string
 *         description: "연도 (예: 2024)"
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *         description: "월 (year와 함께 사용, 예: 01, 02, ..., 12)"
 *     responses:
 *       200:
 *         description: "배우 상세 정보 및 티켓 목록"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 actor:
 *                   type: object
 *                   properties:
 *                     actorName:
 *                       type: string
 *                     viewCount:
 *                       type: integer
 *                     totalTicketPrice:
 *                       type: integer
 *                     uniquePerformances:
 *                       type: integer
 *                     performanceList:
 *                       type: array
 *                       items:
 *                         type: string
 *                 tickets:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       date:
 *                         type: string
 *                         format: date
 *                       performanceName:
 *                         type: string
 *                       theater:
 *                         type: string
 *                       seat:
 *                         type: string
 *                       rating:
 *                         type: integer
 *                       posterUrl:
 *                         type: string
 *       404:
 *         description: "배우를 찾을 수 없습니다"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: "인증 실패"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  "/actors/:actorName",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { actorName } = req.params;
      const { year, month } = req.query;

      const dateFilter = buildDateFilter(year as string, month as string);
      if (dateFilter === null) {
        res.status(400).json({ error: "월은 1-12 사이의 값이어야 합니다.", code: "INVALID_MONTH" });
        return;
      }

      const where: any = {
        actorName: decodeURIComponent(actorName),
        ticket: { userId, ...dateFilter },
      };

      const castings = await prisma.ticketCasting.findMany({
        where,
        include: {
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
      });

      if (castings.length === 0) {
        res.status(404).json({ error: "배우를 찾을 수 없습니다.", code: "ACTOR_NOT_FOUND" });
        return;
      }

      const performances = new Set<string>();
      let totalTicketPrice = 0;
      castings.forEach((casting) => {
        performances.add(casting.ticket.performanceName);
        totalTicketPrice += casting.ticket.ticketPrice;
      });

      const actor = {
        actorName: decodeURIComponent(actorName),
        viewCount: castings.length,
        totalTicketPrice,
        uniquePerformances: performances.size,
        performanceList: Array.from(performances),
      };

      const tickets = castings
        .map((casting) => ({
          id: casting.ticket.id,
          date: casting.ticket.date.toISOString().split("T")[0],
          performanceName: casting.ticket.performanceName,
          theater: casting.ticket.theater,
          seat: casting.ticket.seat,
          rating: casting.ticket.rating,
          posterUrl: casting.ticket.posterUrl,
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      res.json({ actor, tickets });
    } catch (error) {
      console.error("배우 상세 정보 오류:", error);
      res.status(500).json({
        error: "배우 상세 정보를 가져오는 중 오류가 발생했습니다.",
        code: "GET_ACTOR_DETAIL_ERROR",
      });
    }
  }
);

export default router;
