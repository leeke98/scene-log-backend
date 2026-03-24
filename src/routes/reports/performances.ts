import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/auth";
import { Genre } from "@prisma/client";
import {
  buildDateFilter,
  formatGenre,
  parsePagination,
  isPaginationError,
} from "../../lib/utils";

const router = Router();

// 모든 리포트 라우트는 인증 필요
router.use(authenticate);

/**
 * @openapi
 * /api/reports/performances:
 *   get:
 *     summary: 작품별 통계
 *     description: 연도별, 월별, 또는 전체 누적 데이터를 조회할 수 있습니다.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: "작품명 검색"
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
 *         description: "작품별 통계 데이터"
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
 *                       name:
 *                         type: string
 *                       viewCount:
 *                         type: integer
 *                       totalTicketPrice:
 *                         type: integer
 *                       avgRating:
 *                         type: number
 *                       posterUrl:
 *                         type: string
 *                         nullable: true
 *                       genre:
 *                         type: string
 *                         enum: [연극, 뮤지컬]
 *                         nullable: true
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       description: "전체 작품 수"
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
router.get(
  "/performances",
  async (req: Request, res: Response): Promise<void> => {
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

      const where: any = { userId, ...dateFilter };

      if (search) {
        where.performanceName = { contains: search as string };
      }

      const tickets = await prisma.ticket.findMany({
        where,
        select: { performanceName: true, ticketPrice: true, rating: true, posterUrl: true, genre: true },
      });

      // 작품별로 그룹화
      const performanceData: Record<
        string,
        { viewCount: number; totalTicketPrice: number; ratings: number[]; posterUrl: string | null; genre: Genre | null }
      > = {};

      tickets.forEach((ticket) => {
        const name = ticket.performanceName;
        if (!performanceData[name]) {
          performanceData[name] = {
            viewCount: 0,
            totalTicketPrice: 0,
            ratings: [],
            posterUrl: ticket.posterUrl,
            genre: ticket.genre,
          };
        }
        performanceData[name].viewCount++;
        performanceData[name].totalTicketPrice += ticket.ticketPrice;
        if (ticket.rating > 0) performanceData[name].ratings.push(ticket.rating);
      });

      const allResults = Object.entries(performanceData)
        .map(([name, data]) => {
          const avgRating =
            data.ratings.length > 0
              ? data.ratings.reduce((sum, r) => sum + r, 0) / data.ratings.length
              : 0;
          return {
            name,
            viewCount: data.viewCount,
            totalTicketPrice: data.totalTicketPrice,
            avgRating: Math.round(avgRating * 10) / 10,
            posterUrl: data.posterUrl,
            genre: formatGenre(data.genre),
          };
        })
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
      console.error("작품별 통계 오류:", error);
      res.status(500).json({
        error: "작품별 통계를 가져오는 중 오류가 발생했습니다.",
        code: "GET_PERFORMANCES_ERROR",
      });
    }
  }
);

/**
 * @openapi
 * /api/reports/performances/top:
 *   get:
 *     summary: 가장 많이 본 작품 Top 10
 *     description: 연도별, 월별, 또는 전체 누적 데이터를 조회할 수 있습니다.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: Top 10 작품 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   performanceName:
 *                     type: string
 *                   posterUrl:
 *                     type: string
 *                     nullable: true
 *                   count:
 *                     type: integer
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  "/performances/top",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { year, month } = req.query;

      const dateFilter = buildDateFilter(year as string, month as string);
      if (dateFilter === null) {
        res.status(400).json({ error: "월은 1-12 사이의 값이어야 합니다.", code: "INVALID_MONTH" });
        return;
      }

      const where: any = { userId, ...dateFilter };

      const performanceCounts = await prisma.ticket.groupBy({
        by: ["performanceName"],
        where,
        _count: { performanceName: true },
        orderBy: { _count: { performanceName: "desc" } },
        take: 10,
      });

      if (performanceCounts.length === 0) {
        res.json([]);
        return;
      }

      // Top 10 작품의 posterUrl을 한 번의 쿼리로 조회
      const performanceNames = performanceCounts.map((p) => p.performanceName);
      const posterTickets = await prisma.ticket.findMany({
        where: { userId, performanceName: { in: performanceNames }, ...dateFilter },
        select: { performanceName: true, posterUrl: true },
        orderBy: { date: "asc" },
        distinct: ["performanceName"],
      });

      const posterMap = new Map(posterTickets.map((t) => [t.performanceName, t.posterUrl]));

      const result = performanceCounts.map((item) => ({
        performanceName: item.performanceName,
        posterUrl: posterMap.get(item.performanceName) ?? null,
        count: item._count.performanceName,
      }));

      res.json(result);
    } catch (error) {
      console.error("가장 많이 본 작품 Top 10 조회 오류:", error);
      res.status(500).json({
        error: "가장 많이 본 작품 Top 10을 가져오는 중 오류가 발생했습니다.",
        code: "GET_TOP_PERFORMANCES_ERROR",
      });
    }
  }
);

/**
 * @openapi
 * /api/reports/performances/{performanceName}:
 *   get:
 *     summary: 작품 상세 정보
 *     description: 연도별, 월별, 또는 전체 누적 데이터를 조회할 수 있습니다.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: performanceName
 *         required: true
 *         schema:
 *           type: string
 *         description: "작품명 (URL 인코딩 필요)"
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
 *         description: "작품 상세 정보 및 티켓 목록"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 performance:
 *                   type: object
 *                   properties:
 *                     performanceName:
 *                       type: string
 *                     viewCount:
 *                       type: integer
 *                     totalTicketPrice:
 *                       type: integer
 *                     avgRating:
 *                       type: number
 *                     firstViewed:
 *                       type: string
 *                       format: date
 *                     lastViewed:
 *                       type: string
 *                       format: date
 *                     posterUrl:
 *                       type: string
 *                       nullable: true
 *                     genre:
 *                       type: string
 *                       enum: [연극, 뮤지컬]
 *                       nullable: true
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
 *                       theater:
 *                         type: string
 *                       seat:
 *                         type: string
 *                       rating:
 *                         type: integer
 *                       review:
 *                         type: string
 *                       ticketPrice:
 *                         type: integer
 *                       posterUrl:
 *                         type: string
 *                       casting:
 *                         type: array
 *                         items:
 *                           type: string
 *       404:
 *         description: "작품을 찾을 수 없습니다"
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
  "/performances/:performanceName",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { performanceName } = req.params;
      const { year, month } = req.query;

      const dateFilter = buildDateFilter(year as string, month as string);
      if (dateFilter === null) {
        res.status(400).json({ error: "월은 1-12 사이의 값이어야 합니다.", code: "INVALID_MONTH" });
        return;
      }

      const where: any = {
        userId,
        performanceName: decodeURIComponent(performanceName),
        ...dateFilter,
      };

      const tickets = await prisma.ticket.findMany({
        where,
        select: {
          id: true,
          date: true,
          theater: true,
          seat: true,
          rating: true,
          review: true,
          ticketPrice: true,
          posterUrl: true,
          genre: true,
          castings: { select: { actorName: true } },
        },
        orderBy: { date: "desc" },
      });

      if (tickets.length === 0) {
        res.status(404).json({ error: "작품을 찾을 수 없습니다.", code: "PERFORMANCE_NOT_FOUND" });
        return;
      }

      const ratings = tickets.filter((t) => t.rating > 0).map((t) => t.rating);
      const dates = tickets.map((t) => t.date).sort((a, b) => a.getTime() - b.getTime());
      const totalTicketPrice = tickets.reduce((sum, t) => sum + t.ticketPrice, 0);
      const avgRating =
        ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : 0;

      const performance = {
        name: decodeURIComponent(performanceName),
        viewCount: tickets.length,
        totalTicketPrice,
        avgRating: Math.round(avgRating * 10) / 10,
        firstViewed: dates[0].toISOString().split("T")[0],
        lastViewed: dates[dates.length - 1].toISOString().split("T")[0],
        posterUrl: tickets[0].posterUrl,
        genre: formatGenre(tickets[0].genre),
      };

      const formattedTickets = tickets.map((ticket) => ({
        id: ticket.id,
        date: ticket.date.toISOString().split("T")[0],
        theater: ticket.theater,
        seat: ticket.seat,
        rating: ticket.rating,
        review: ticket.review,
        casting: ticket.castings.map((c) => c.actorName),
      }));

      res.json({ performance, tickets: formattedTickets });
    } catch (error) {
      console.error("작품 상세 정보 오류:", error);
      res.status(500).json({
        error: "작품 상세 정보를 가져오는 중 오류가 발생했습니다.",
        code: "GET_PERFORMANCE_DETAIL_ERROR",
      });
    }
  }
);

export default router;
