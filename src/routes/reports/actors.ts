import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/auth";

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
      ticket: {
        userId,
      },
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
      where.ticket.date = dateFilter.date;
    } else if (year) {
      // 연도별 조회: 해당 연도에 본 작품들의 누적 통계
      const dateFilter = getYearFilter(year as string);
      where.ticket.date = dateFilter.date;
    }
    // 파라미터가 없으면 전체 누적 데이터 (where에 추가 조건 없음)

    if (search) {
      where.actorName = {
        contains: search as string,
      };
    }

    const castings = await prisma.ticketCasting.findMany({
      where,
      include: {
        ticket: {
          select: {
            ticketPrice: true,
            performanceName: true,
          },
        },
      },
    });

    // 배우별로 그룹화
    const actorData: Record<
      string,
      {
        viewCount: number;
        totalTicketPrice: number;
        performances: Set<string>;
      }
    > = {};

    castings.forEach((casting) => {
      const actorName = casting.actorName;
      if (!actorData[actorName]) {
        actorData[actorName] = {
          viewCount: 0,
          totalTicketPrice: 0,
          performances: new Set(),
        };
      }
      actorData[actorName].viewCount++;
      actorData[actorName].totalTicketPrice += casting.ticket.ticketPrice;
      actorData[actorName].performances.add(casting.ticket.performanceName);
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

      const where: any = {
        actorName: decodeURIComponent(actorName),
        ticket: {
          userId,
        },
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
        where.ticket.date = dateFilter.date;
      } else if (year) {
        // 연도별 조회: 해당 연도에 본 작품들의 누적 통계
        const dateFilter = getYearFilter(year as string);
        where.ticket.date = dateFilter.date;
      }
      // 파라미터가 없으면 전체 누적 데이터 (where에 추가 조건 없음)

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
        res.status(404).json({
          error: "배우를 찾을 수 없습니다.",
          code: "ACTOR_NOT_FOUND",
        });
        return;
      }

      // 통계 계산
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

      const tickets = castings.map((casting) => ({
        id: casting.ticket.id,
        date: casting.ticket.date.toISOString().split("T")[0],
        performanceName: casting.ticket.performanceName,
        theater: casting.ticket.theater,
        seat: casting.ticket.seat,
        rating: casting.ticket.rating,
        posterUrl: casting.ticket.posterUrl,
      }));

      res.json({
        actor,
        tickets,
      });
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
