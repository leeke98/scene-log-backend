import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/auth";
import {
  buildReportDateFilter,
  buildGenreFilter,
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
 *         description: "작품명 검색"
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

      const baseWhere = {
        userId,
        ...dateFilter,
        ...genreFilter,
        ...(search ? { performanceName: { contains: search as string } } : {}),
      };

      // Step 1: DB에서 작품별 집계 (viewCount, totalTicketPrice)
      const performanceGroups = await prisma.ticket.groupBy({
        by: ["performanceName"],
        where: baseWhere,
        _count: { performanceName: true },
        _sum: { ticketPrice: true },
        orderBy: { _count: { performanceName: "desc" } },
      });

      const total = performanceGroups.length;
      const startIndex = (pageNum - 1) * limitNum;
      const paginatedGroups = performanceGroups.slice(startIndex, startIndex + limitNum);

      if (paginatedGroups.length === 0) {
        res.json({
          data: [],
          pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
        });
        return;
      }

      // Step 2: 현재 페이지 작품들의 posterUrl, genre, rating만 조회
      const performanceNames = paginatedGroups.map((g) => g.performanceName);
      const tickets = await prisma.ticket.findMany({
        where: { ...baseWhere, performanceName: { in: performanceNames } },
        select: { performanceName: true, rating: true, posterUrl: true, genre: true },
      });

      const detailMap: Record<
        string,
        { ratings: number[]; posterUrl: string | null; genre: Parameters<typeof formatGenre>[0] }
      > = {};
      tickets.forEach((ticket) => {
        const name = ticket.performanceName;
        if (!detailMap[name]) {
          detailMap[name] = { ratings: [], posterUrl: ticket.posterUrl, genre: ticket.genre };
        }
        if (ticket.rating > 0) detailMap[name].ratings.push(ticket.rating);
      });

      const data = paginatedGroups.map((group) => {
        const detail = detailMap[group.performanceName];
        const ratings = detail?.ratings ?? [];
        const avgRating =
          ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : 0;
        return {
          name: group.performanceName,
          viewCount: group._count.performanceName,
          totalTicketPrice: group._sum.ticketPrice ?? 0,
          avgRating: Math.round(avgRating * 10) / 10,
          posterUrl: detail?.posterUrl ?? null,
          genre: formatGenre(detail?.genre ?? null),
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
 *     description: >
 *       연도별, 월별, 임의 기간별, 또는 전체 누적 데이터를 조회할 수 있습니다.
 *       startDate/endDate가 있으면 year/month는 무시됩니다.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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

      const where = { userId, ...dateFilter, ...genreFilter };

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
        where: { userId, performanceName: { in: performanceNames }, ...dateFilter, ...genreFilter },
        select: { performanceName: true, posterUrl: true },
        orderBy: { date: "asc" },
        distinct: ["performanceName"],
      });

      const posterMap = new Map(posterTickets.map((t) => [t.performanceName, t.posterUrl]));

      res.json(
        performanceCounts.map((item) => ({
          performanceName: item.performanceName,
          posterUrl: posterMap.get(item.performanceName) ?? null,
          count: item._count.performanceName,
        }))
      );
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
 *     description: >
 *       연도별, 월별, 임의 기간별, 또는 전체 누적 데이터를 조회할 수 있습니다.
 *       startDate/endDate가 있으면 year/month는 무시됩니다.
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

      const tickets = await prisma.ticket.findMany({
        where: {
          userId,
          performanceName: decodeURIComponent(performanceName),
          ...dateFilter,
          ...genreFilter,
        },
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
