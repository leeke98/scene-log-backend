import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/auth";
import { Genre } from "@prisma/client";

const router = Router();

// 모든 리포트 라우트는 인증 필요
router.use(authenticate);

/**
 * 연도 필터 조건 생성
 * @db.Date는 날짜만 저장하므로 시간 부분은 무시됨
 */
const getYearFilter = (year?: string) => {
  if (!year) return {};
  const yearNum = parseInt(year, 10);
  // UTC 자정으로 변환 (날짜만 비교)
  const startDate = new Date(`${yearNum}-01-01T00:00:00.000Z`); // 1월 1일
  const endDate = new Date(`${yearNum}-12-31T00:00:00.000Z`); // 12월 31일
  return {
    date: {
      gte: startDate,
      lte: endDate,
    },
  };
};

/**
 * 연도-월 필터 조건 생성
 * @db.Date는 날짜만 저장하므로 시간 부분은 무시됨
 */
const getYearMonthFilter = (year: string, month: string) => {
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);

  // 해당 월의 첫 날 (UTC 자정)
  const startDate = new Date(
    `${yearNum}-${monthNum.toString().padStart(2, "0")}-01T00:00:00.000Z`
  );

  // 해당 월의 마지막 날 (UTC 자정)
  const lastDay = new Date(yearNum, monthNum, 0).getDate();
  const endDate = new Date(
    `${yearNum}-${monthNum.toString().padStart(2, "0")}-${lastDay
      .toString()
      .padStart(2, "0")}T00:00:00.000Z`
  );

  return {
    date: {
      gte: startDate,
      lte: endDate,
    },
  };
};

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

      // 페이징 파라미터 파싱 및 기본값 설정
      const pageNum = parseInt((page as string) || "1", 10);
      const limitNum = parseInt((limit as string) || "20", 10);

      // 유효성 검사
      if (pageNum < 1) {
        res.status(400).json({
          error: "페이지 번호는 1 이상이어야 합니다.",
          code: "INVALID_PAGE",
        });
        return;
      }

      if (limitNum < 1 || limitNum > 100) {
        res.status(400).json({
          error: "페이지당 항목 수는 1 이상 100 이하여야 합니다.",
          code: "INVALID_LIMIT",
        });
        return;
      }

      const where: any = {
        userId,
      };

      // 필터 조건 설정
      if (year && month && month !== "") {
        // 연도-월별 조회: 해당 월에 본 작품들의 누적 통계
        const monthStr = (month as string).padStart(2, "0");
        if (parseInt(monthStr, 10) < 1 || parseInt(monthStr, 10) > 12) {
          res.status(400).json({
            error: "월은 1-12 사이의 값이어야 합니다.",
            code: "INVALID_MONTH",
          });
          return;
        }
        const dateFilter = getYearMonthFilter(year as string, monthStr);
        where.date = dateFilter.date;
      } else if (year) {
        // 연도별 조회: 해당 연도에 본 작품들의 누적 통계
        const dateFilter = getYearFilter(year as string);
        where.date = dateFilter.date;
      }
      // 파라미터가 없으면 전체 누적 데이터 (where에 추가 조건 없음)

      if (search) {
        where.performanceName = {
          contains: search as string,
        };
      }

      const tickets = await prisma.ticket.findMany({
        where,
        select: {
          performanceName: true,
          ticketPrice: true,
          rating: true,
          posterUrl: true,
          genre: true,
        },
      });

      // 작품별로 그룹화
      const performanceData: Record<
        string,
        {
          viewCount: number;
          totalTicketPrice: number;
          ratings: number[];
          posterUrl: string | null;
          genre: Genre | null;
        }
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
        if (ticket.rating > 0) {
          performanceData[name].ratings.push(ticket.rating);
        }
      });

      const allResults = Object.entries(performanceData)
        .map(([name, data]) => {
          const avgRating =
            data.ratings.length > 0
              ? data.ratings.reduce((sum, r) => sum + r, 0) /
                data.ratings.length
              : 0;

          return {
            name,
            viewCount: data.viewCount,
            totalTicketPrice: data.totalTicketPrice,
            avgRating: Math.round(avgRating * 10) / 10,
            posterUrl: data.posterUrl,
            genre:
              data.genre === Genre.THEATER
                ? "연극"
                : data.genre === Genre.MUSICAL
                ? "뮤지컬"
                : null,
          };
        })
        .sort((a, b) => b.viewCount - a.viewCount);

      // 페이징 처리
      const total = allResults.length;
      const totalPages = Math.ceil(total / limitNum);
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;
      const paginatedResults = allResults.slice(startIndex, endIndex);

      res.json({
        data: paginatedResults,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages,
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

      const where: any = {
        userId,
      };

      // 필터 조건 설정 및 저장 (posterUrl 조회 시에도 사용)
      let dateFilter: any = null;
      if (year && month && month !== "") {
        // 연도-월별 조회: 해당 월에 본 작품들의 누적 통계
        const monthStr = (month as string).padStart(2, "0");
        if (parseInt(monthStr, 10) < 1 || parseInt(monthStr, 10) > 12) {
          res.status(400).json({
            error: "월은 1-12 사이의 값이어야 합니다.",
            code: "INVALID_MONTH",
          });
          return;
        }
        dateFilter = getYearMonthFilter(year as string, monthStr);
        where.date = dateFilter.date;
      } else if (year) {
        // 연도별 조회: 해당 연도에 본 작품들의 누적 통계
        dateFilter = getYearFilter(year as string);
        where.date = dateFilter.date;
      }
      // 파라미터가 없으면 전체 누적 데이터 (where에 추가 조건 없음)

      // 작품별로 그룹화하여 Top 10 조회
      // performanceName으로만 그룹화 (posterUrl은 나중에 첫 번째 값만 가져옴)
      const performanceCounts = await prisma.ticket.groupBy({
        by: ["performanceName"],
        where,
        _count: {
          performanceName: true,
        },
        orderBy: {
          _count: {
            performanceName: "desc",
          },
        },
        take: 10,
      });

      // 각 작품의 첫 번째 posterUrl 가져오기 (동일한 필터 조건 적용)
      const result = await Promise.all(
        performanceCounts.map(async (item) => {
          const ticketWhere: any = {
            userId,
            performanceName: item.performanceName,
          };

          // 필터 조건이 있으면 동일하게 적용
          if (dateFilter) {
            ticketWhere.date = dateFilter.date;
          }

          const firstTicket = await prisma.ticket.findFirst({
            where: ticketWhere,
            select: {
              posterUrl: true,
            },
            orderBy: {
              date: "asc", // 가장 오래된 티켓의 posterUrl 사용
            },
          });

          return {
            performanceName: item.performanceName,
            posterUrl: firstTicket?.posterUrl || null,
            count: item._count.performanceName,
          };
        })
      );

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

      const where: any = {
        userId,
        performanceName: decodeURIComponent(performanceName),
      };

      // 필터 조건 설정
      if (year && month && month !== "") {
        // 연도-월별 조회: 해당 월에 본 작품들의 누적 통계
        const monthStr = (month as string).padStart(2, "0");
        if (parseInt(monthStr, 10) < 1 || parseInt(monthStr, 10) > 12) {
          res.status(400).json({
            error: "월은 1-12 사이의 값이어야 합니다.",
            code: "INVALID_MONTH",
          });
          return;
        }
        const dateFilter = getYearMonthFilter(year as string, monthStr);
        where.date = dateFilter.date;
      } else if (year) {
        // 연도별 조회: 해당 연도에 본 작품들의 누적 통계
        const dateFilter = getYearFilter(year as string);
        where.date = dateFilter.date;
      }
      // 파라미터가 없으면 전체 누적 데이터 (where에 추가 조건 없음)

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
          castings: {
            select: {
              actorName: true,
            },
          },
        },
        orderBy: {
          date: "desc",
        },
      });

      if (tickets.length === 0) {
        res.status(404).json({
          error: "작품을 찾을 수 없습니다.",
          code: "PERFORMANCE_NOT_FOUND",
        });
        return;
      }

      // 통계 계산
      const ratings = tickets.filter((t) => t.rating > 0).map((t) => t.rating);
      const dates = tickets
        .map((t) => t.date)
        .sort((a, b) => a.getTime() - b.getTime());
      const totalTicketPrice = tickets.reduce(
        (sum, t) => sum + t.ticketPrice,
        0
      );
      const avgRating =
        ratings.length > 0
          ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
          : 0;

      const performance = {
        name: decodeURIComponent(performanceName),
        viewCount: tickets.length,
        totalTicketPrice,
        avgRating: Math.round(avgRating * 10) / 10,
        firstViewed: dates[0].toISOString().split("T")[0],
        lastViewed: dates[dates.length - 1].toISOString().split("T")[0],
        posterUrl: tickets[0].posterUrl,
        genre:
          tickets[0].genre === Genre.THEATER
            ? "연극"
            : tickets[0].genre === Genre.MUSICAL
            ? "뮤지컬"
            : null,
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

      res.json({
        performance,
        tickets: formattedTickets,
      });
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
