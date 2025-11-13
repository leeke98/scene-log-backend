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
 * ISO 주 번호 계산
 */
function getISOWeek(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * GET /api/reports/summary
 * 전체 통계 요약
 * 쿼리 파라미터:
 *   - year: 연도별 조회 (예: 2024)
 *   - month: 월별 조회 (year와 함께 사용, 예: 01, 02, ..., 12)
 *   - 파라미터 없음: 전체 누적 데이터 조회
 */
router.get("/summary", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { year, month } = req.query;

    const where: any = {
      userId,
    };

    // 필터 조건 설정 및 저장
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

    // 가장 많이 본 배우 필터 조건
    const actorWhere: any = {
      ticket: {
        userId,
      },
    };
    if (dateFilter) {
      actorWhere.ticket.date = dateFilter.date;
    }

    // 모든 쿼리를 병렬로 실행하여 성능 최적화
    const [
      totalCount,
      totalTicketPriceResult,
      totalMdPriceResult,
      uniquePerformances,
      actorCounts,
      performanceCounts,
    ] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.aggregate({
        where,
        _sum: {
          ticketPrice: true,
        },
      }),
      prisma.ticket.aggregate({
        where,
        _sum: {
          mdPrice: true,
        },
      }),
      prisma.ticket.groupBy({
        by: ["performanceName"],
        where,
      }),
      prisma.ticketCasting.groupBy({
        by: ["actorName"],
        where: actorWhere,
        _count: {
          actorName: true,
        },
        orderBy: {
          _count: {
            actorName: "desc",
          },
        },
        take: 1,
      }),
      prisma.ticket.groupBy({
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
        take: 1,
      }),
    ]);

    const totalTicketPrice = totalTicketPriceResult._sum.ticketPrice || 0;
    const totalMdPrice = totalMdPriceResult._sum.mdPrice || 0;

    const mostViewedActor =
      actorCounts.length > 0
        ? {
            name: actorCounts[0].actorName,
            count: actorCounts[0]._count.actorName,
          }
        : null;

    const mostViewedPerformance =
      performanceCounts.length > 0
        ? {
            name: performanceCounts[0].performanceName,
            count: performanceCounts[0]._count.performanceName,
          }
        : null;

    res.json({
      totalCount,
      totalTicketPrice,
      totalMdPrice,
      uniquePerformances: uniquePerformances.length,
      mostViewedActor,
      mostViewedPerformance,
    });
  } catch (error) {
    console.error("전체 통계 요약 오류:", error);
    res.status(500).json({
      error: "통계 요약을 가져오는 중 오류가 발생했습니다.",
      code: "GET_SUMMARY_ERROR",
    });
  }
});

/**
 * GET /api/reports/monthly
 * 월별 통계
 */
router.get("/monthly", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { year } = req.query;

    const where: any = {
      userId,
      ...getYearFilter(year as string),
    };

    const tickets = await prisma.ticket.findMany({
      where,
      select: {
        date: true,
        ticketPrice: true,
      },
    });

    // 월별로 그룹화
    const monthlyData: Record<string, { count: number; totalPrice: number }> =
      {};

    tickets.forEach((ticket) => {
      const yearMonth = ticket.date.toISOString().substring(0, 7); // YYYY-MM
      if (!monthlyData[yearMonth]) {
        monthlyData[yearMonth] = { count: 0, totalPrice: 0 };
      }
      monthlyData[yearMonth].count++;
      monthlyData[yearMonth].totalPrice += ticket.ticketPrice;
    });

    const result = Object.entries(monthlyData)
      .map(([yearMonth, data]) => ({
        yearMonth,
        count: data.count,
        totalPrice: data.totalPrice,
      }))
      .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

    res.json(result);
  } catch (error) {
    console.error("월별 통계 오류:", error);
    res.status(500).json({
      error: "월별 통계를 가져오는 중 오류가 발생했습니다.",
      code: "GET_MONTHLY_ERROR",
    });
  }
});

/**
 * GET /api/reports/weekly
 * 주별 통계
 */
router.get("/weekly", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { yearMonth } = req.query;

    const where: any = {
      userId,
    };

    if (yearMonth) {
      const [year, month] = (yearMonth as string).split("-");
      const startDate = new Date(`${year}-${month}-01`);
      const endDate = new Date(`${year}-${month}-31`);
      where.date = {
        gte: startDate,
        lte: endDate,
      };
    }

    const tickets = await prisma.ticket.findMany({
      where,
      select: {
        date: true,
        ticketPrice: true,
      },
    });

    // 주별로 그룹화 (ISO 주 번호 사용)
    const weeklyData: Record<string, { count: number; totalPrice: number }> =
      {};

    tickets.forEach((ticket) => {
      const date = new Date(ticket.date);
      const year = date.getFullYear();
      const week = getISOWeek(date);
      const yearWeek = `${year}-W${week.toString().padStart(2, "0")}`;

      if (!weeklyData[yearWeek]) {
        weeklyData[yearWeek] = { count: 0, totalPrice: 0 };
      }
      weeklyData[yearWeek].count++;
      weeklyData[yearWeek].totalPrice += ticket.ticketPrice;
    });

    const result = Object.entries(weeklyData)
      .map(([yearWeek, data]) => ({
        yearWeek,
        count: data.count,
        totalPrice: data.totalPrice,
      }))
      .sort((a, b) => a.yearWeek.localeCompare(b.yearWeek));

    res.json(result);
  } catch (error) {
    console.error("주별 통계 오류:", error);
    res.status(500).json({
      error: "주별 통계를 가져오는 중 오류가 발생했습니다.",
      code: "GET_WEEKLY_ERROR",
    });
  }
});

/**
 * GET /api/reports/day-of-week
 * 요일별 통계
 * 쿼리 파라미터:
 *   - year: 연도별 조회 (예: 2024)
 *   - month: 월별 조회 (year와 함께 사용, 예: 01, 02, ..., 12)
 *   - 파라미터 없음: 전체 누적 데이터 조회
 */
router.get(
  "/day-of-week",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { year, month } = req.query;

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

      const tickets = await prisma.ticket.findMany({
        where,
        select: {
          date: true,
        },
      });

      const dayNames = [
        "일요일",
        "월요일",
        "화요일",
        "수요일",
        "목요일",
        "금요일",
        "토요일",
      ];
      const dayCounts: Record<string, number> = {
        일요일: 0,
        월요일: 0,
        화요일: 0,
        수요일: 0,
        목요일: 0,
        금요일: 0,
        토요일: 0,
      };

      tickets.forEach((ticket) => {
        const dayOfWeek = ticket.date.getDay();
        const dayName = dayNames[dayOfWeek];
        dayCounts[dayName]++;
      });

      const result = Object.entries(dayCounts).map(([dayOfWeek, count]) => ({
        dayOfWeek,
        count,
      }));

      res.json(result);
    } catch (error) {
      console.error("요일별 통계 오류:", error);
      res.status(500).json({
        error: "요일별 통계를 가져오는 중 오류가 발생했습니다.",
        code: "GET_DAY_OF_WEEK_ERROR",
      });
    }
  }
);

/**
 * GET /api/reports/grass
 * 잔디밭 데이터 (GitHub 스타일)
 */
router.get("/grass", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { year } = req.query;

    const where: any = {
      userId,
      ...getYearFilter(year as string),
    };

    const tickets = await prisma.ticket.findMany({
      where,
      select: {
        date: true,
      },
    });

    // 날짜별로 그룹화
    const dateCounts: Record<string, number> = {};

    tickets.forEach((ticket) => {
      const dateStr = ticket.date.toISOString().split("T")[0];
      dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
    });

    const result = Object.entries(dateCounts)
      .map(([date, count]) => ({
        date,
        count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json(result);
  } catch (error) {
    console.error("잔디밭 데이터 오류:", error);
    res.status(500).json({
      error: "잔디밭 데이터를 가져오는 중 오류가 발생했습니다.",
      code: "GET_GRASS_ERROR",
    });
  }
});

export default router;
