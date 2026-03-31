import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/auth";
import { buildReportDateFilter, buildGenreFilter } from "../../lib/utils";

const router = Router();

// 모든 리포트 라우트는 인증 필요
router.use(authenticate);

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
 * 월 내 주 번호 계산 (해당 월의 첫째주, 둘째주 등)
 * 월요일을 주의 시작으로 간주
 */
function getWeekInMonth(date: Date): number {
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstDayOfWeek = firstDayOfMonth.getDay(); // 0(일요일) ~ 6(토요일)

  // 월요일을 주의 시작으로 간주 (월요일 = 1, 일요일 = 7)
  const adjustedFirstDayOfWeek = firstDayOfWeek === 0 ? 7 : firstDayOfWeek;

  const dayOfMonth = date.getDate();

  // 첫 주의 시작일(월요일)까지의 일수 계산
  // 첫 날이 월요일이면 0, 화요일이면 1, ..., 일요일이면 6
  const daysToFirstMonday =
    adjustedFirstDayOfWeek === 1 ? 0 : 8 - adjustedFirstDayOfWeek;

  // 첫 번째 월요일의 날짜
  const firstMonday = daysToFirstMonday + 1;

  if (dayOfMonth < firstMonday) {
    // 첫 번째 월요일 이전이면 첫째주
    return 1;
  }

  // 첫 번째 월요일부터의 일수 계산
  const daysFromFirstMonday = dayOfMonth - firstMonday;

  // 주 번호 계산 (첫 번째 월요일이 포함된 주가 첫째주)
  const weekNumber = Math.floor(daysFromFirstMonday / 7) + 1;

  return weekNumber;
}

/**
 * @openapi
 * /api/reports/summary:
 *   get:
 *     summary: 전체 통계 요약
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
 *         description: 통계 요약 데이터
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalTickets:
 *                   type: integer
 *                 totalPerformances:
 *                   type: integer
 *                 totalActors:
 *                   type: integer
 *                 totalSpent:
 *                   type: integer
 *                 averageRating:
 *                   type: number
 *                 mostViewedTheater:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     name:
 *                       type: string
 *                     count:
 *                       type: integer
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/summary", async (req: Request, res: Response): Promise<void> => {
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

    const where: any = { userId, ...dateFilter, ...genreFilter };

    // 가장 많이 본 배우 필터 조건
    const actorWhere: any = {
      ticket: { userId, ...dateFilter, ...genreFilter },
    };

    // 모든 쿼리를 병렬로 실행하여 성능 최적화
    const [
      totalCount,
      totalTicketPriceResult,
      totalMdPriceResult,
      uniquePerformances,
      actorCounts,
      performanceCounts,
      theaterCounts,
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
      prisma.ticket.groupBy({
        by: ["theater"],
        where,
        _count: {
          theater: true,
        },
        orderBy: {
          _count: {
            theater: "desc",
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

    const mostViewedTheater =
      theaterCounts.length > 0
        ? {
            name: theaterCounts[0].theater,
            count: theaterCounts[0]._count.theater,
          }
        : null;

    res.json({
      totalCount,
      totalTicketPrice,
      totalMdPrice,
      uniquePerformances: uniquePerformances.length,
      mostViewedActor,
      mostViewedPerformance,
      mostViewedTheater,
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
 * @openapi
 * /api/reports/monthly:
 *   get:
 *     summary: 월별 통계
 *     description: >
 *       연도별, 임의 기간별, 또는 전체 누적 데이터를 조회할 수 있습니다.
 *       startDate/endDate가 있으면 year는 무시됩니다.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 시작일 (YYYY-MM-DD). 지정 시 year 무시"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 종료일 (YYYY-MM-DD). 지정 시 year 무시"
 *       - in: query
 *         name: year
 *         schema:
 *           type: string
 *         description: "연도 (예: 2024). startDate/endDate가 없을 때 사용"
 *       - in: query
 *         name: genre
 *         schema:
 *           type: string
 *           enum: [뮤지컬, 연극]
 *         description: "장르 필터 (없으면 전체)"
 *     responses:
 *       200:
 *         description: "월별 통계 데이터"
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   yearMonth:
 *                     type: string
 *                     example: "2024-01"
 *                   count:
 *                     type: integer
 *                   totalPrice:
 *                     type: integer
 *       401:
 *         description: "인증 실패"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/monthly", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { year, startDate, endDate, genre } = req.query;

    const dateFilter = buildReportDateFilter({
      year: year as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });
    if (dateFilter === null) {
      res.status(400).json({ error: "날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식으로 입력해주세요.", code: "INVALID_DATE" });
      return;
    }

    const genreFilter = buildGenreFilter(genre as string);
    if (genreFilter === null) {
      res.status(400).json({ error: "장르는 '뮤지컬' 또는 '연극'이어야 합니다.", code: "INVALID_GENRE" });
      return;
    }

    const where: any = { userId, ...dateFilter, ...genreFilter };

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
 * @openapi
 * /api/reports/weekly:
 *   get:
 *     summary: 주별 통계
 *     description: >
 *       주별 통계를 조회합니다. startDate/endDate가 있으면 yearMonth는 무시됩니다.
 *       startDate/endDate 사용 시 ISO 주 번호('YYYY-N') 형식으로 반환됩니다.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 시작일 (YYYY-MM-DD). 지정 시 yearMonth 무시"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 종료일 (YYYY-MM-DD). 지정 시 yearMonth 무시"
 *       - in: query
 *         name: yearMonth
 *         schema:
 *           type: string
 *         description: "연도-월 (YYYY-MM 형식, 예: 2024-01). startDate/endDate가 없을 때 사용"
 *       - in: query
 *         name: genre
 *         schema:
 *           type: string
 *           enum: [뮤지컬, 연극]
 *         description: "장르 필터 (없으면 전체)"
 *     responses:
 *       200:
 *         description: "주별 통계 데이터"
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   yearWeek:
 *                     type: string
 *                     description: "yearMonth 사용 시 'YYYY-MM-N' (예: 2024-02-1), 그 외 'YYYY-N' ISO 주 형식 (예: 2024-7)"
 *                     example: "2024-02-1"
 *                   count:
 *                     type: integer
 *                   totalPrice:
 *                     type: integer
 *       400:
 *         description: "잘못된 요청"
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
router.get("/weekly", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { yearMonth, startDate, endDate, genre } = req.query;

    const where: any = { userId };

    let isMonthFilter = false;
    let monthYear: string | null = null;
    let monthMonth: string | null = null;

    const genreFilter = buildGenreFilter(genre as string);
    if (genreFilter === null) {
      res.status(400).json({ error: "장르는 '뮤지컬' 또는 '연극'이어야 합니다.", code: "INVALID_GENRE" });
      return;
    }
    Object.assign(where, genreFilter);

    if (startDate || endDate) {
      // startDate/endDate 우선 (yearMonth 무시)
      const gte = startDate ? new Date((startDate as string) + "T00:00:00.000Z") : undefined;
      const lte = endDate ? new Date((endDate as string) + "T00:00:00.000Z") : undefined;
      if ((gte && isNaN(gte.getTime())) || (lte && isNaN(lte.getTime()))) {
        res.status(400).json({ error: "날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식으로 입력해주세요.", code: "INVALID_DATE" });
        return;
      }
      const dateRange: any = {};
      if (gte) dateRange.gte = gte;
      if (lte) dateRange.lte = lte;
      if (Object.keys(dateRange).length > 0) where.date = dateRange;
      // isMonthFilter remains false → ISO 주 번호 형식 사용
    } else if (yearMonth) {
      isMonthFilter = true;
      const [year, month] = (yearMonth as string).split("-");
      monthYear = year;
      monthMonth = month;
      where.date = {
        gte: new Date(`${year}-${month}-01`),
        lte: new Date(`${year}-${month}-31`),
      };
    }

    const tickets = await prisma.ticket.findMany({
      where,
      select: {
        date: true,
        ticketPrice: true,
      },
    });

    // 주별로 그룹화
    const weeklyData: Record<string, { count: number; totalPrice: number }> =
      {};

    tickets.forEach((ticket) => {
      const date = new Date(ticket.date);
      let yearWeek: string;

      if (isMonthFilter && monthYear && monthMonth) {
        // 월 필터가 있는 경우: 해당 월의 주 번호 사용 (예: "2024-02-1", "2024-02-2")
        const weekInMonth = getWeekInMonth(date);
        yearWeek = `${monthYear}-${monthMonth}-${weekInMonth}`;
      } else {
        // 월 필터가 없는 경우: ISO 주 번호 사용 (예: "2024-7")
        const year = date.getFullYear();
        const week = getISOWeek(date);
        yearWeek = `${year}-${week}`;
      }

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
 * @openapi
 * /api/reports/day-of-week:
 *   get:
 *     summary: 요일별 통계
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
 *         description: "요일별 통계 데이터"
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   dayOfWeek:
 *                     type: string
 *                     enum: [일요일, 월요일, 화요일, 수요일, 목요일, 금요일, 토요일]
 *                   count:
 *                     type: integer
 *       400:
 *         description: "잘못된 요청"
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
  "/day-of-week",
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

      const where: any = { userId, ...dateFilter, ...genreFilter };

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
 * @openapi
 * /api/reports/grass:
 *   get:
 *     summary: 잔디밭 데이터 (GitHub 스타일)
 *     description: 현재 연도 포함 최근 5년치 데이터를 누적하여 월-일 기준으로 집계합니다.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "월-일별 티켓 개수 데이터 (누적, 최근 5년)"
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   date:
 *                     type: string
 *                     pattern: "^\\d{2}-\\d{2}$"
 *                     example: "01-15"
 *                     description: "월-일 형식 (MM-DD)"
 *                   count:
 *                     type: integer
 *       401:
 *         description: "인증 실패"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/grass", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    // 현재 연도 포함 최근 5년치 데이터만 조회
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 4; // 5년치 (현재 연도 포함)
    const startDate = new Date(`${startYear}-01-01T00:00:00.000Z`);
    const endDate = new Date(`${currentYear}-12-31T23:59:59.999Z`);

    const tickets = await prisma.ticket.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        date: true,
      },
    });

    // 월-일별로 그룹화 (연도 무시)
    const dateCounts: Record<string, number> = {};

    tickets.forEach((ticket) => {
      const date = new Date(ticket.date);
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      const monthDay = `${month}-${day}`;
      dateCounts[monthDay] = (dateCounts[monthDay] || 0) + 1;
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
