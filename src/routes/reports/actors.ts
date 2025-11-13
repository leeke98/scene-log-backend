import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/auth";

const router = Router();

// 모든 리포트 라우트는 인증 필요
router.use(authenticate);

/**
 * 연도 필터 조건 생성
 */
const getYearFilter = (year?: string) => {
  if (!year) return {};
  const startDate = new Date(`${year}-01-01`);
  const endDate = new Date(`${year}-12-31`);
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
 *     responses:
 *       200:
 *         description: "배우별 통계 데이터"
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   actorName:
 *                     type: string
 *                   viewCount:
 *                     type: integer
 *                   totalTicketPrice:
 *                     type: integer
 *                   uniquePerformances:
 *                     type: integer
 *                   performanceList:
 *                     type: array
 *                     items:
 *                       type: string
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
    const { search, year } = req.query;

    const where: any = {
      ticket: {
        userId,
        ...getYearFilter(year as string),
      },
    };

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

    const result = Object.entries(actorData)
      .map(([actorName, data]) => ({
        actorName,
        viewCount: data.viewCount,
        totalTicketPrice: data.totalTicketPrice,
        uniquePerformances: data.performances.size,
        performanceList: Array.from(data.performances),
      }))
      .sort((a, b) => b.viewCount - a.viewCount);

    res.json(result);
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
      const { year } = req.query;

      const where: any = {
        actorName: decodeURIComponent(actorName),
        ticket: {
          userId,
          ...getYearFilter(year as string),
        },
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
