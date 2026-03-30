import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";
import {
  parseDate,
  parseTime,
  formatDate,
  formatTime,
  parseGenre,
  formatGenre,
  parsePagination,
  isPaginationError,
} from "../lib/utils";

const router = Router();

// 모든 티켓 라우트는 인증 필요
router.use(authenticate);

type TicketWithCastings = Prisma.TicketGetPayload<{
  include: { castings: { select: { actorName: true } } };
}>;

/**
 * 티켓 데이터를 응답 형식으로 변환
 */
const formatTicketResponse = (ticket: TicketWithCastings) => {
  return {
    id: ticket.id,
    date: formatDate(ticket.date),
    time: formatTime(ticket.time),
    performanceName: ticket.performanceName,
    genre: formatGenre(ticket.genre),
    isChild: ticket.isChild,
    theater: ticket.theater,
    seat: ticket.seat,
    ticketPrice: ticket.ticketPrice,
    companion: ticket.companion,
    mdPrice: ticket.mdPrice,
    rating: ticket.rating,
    review: ticket.review,
    posterUrl: ticket.posterUrl,
    casting: ticket.castings.map((c) => c.actorName),
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
};

/**
 * @openapi
 * /api/tickets:
 *   get:
 *     summary: 티켓 목록 조회
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema:
 *           type: string
 *         description: 연도
 *       - in: query
 *         name: genre
 *         schema:
 *           type: string
 *           enum: [연극, 뮤지컬]
 *         description: 장르
 *       - in: query
 *         name: performanceName
 *         schema:
 *           type: string
 *         description: 작품명 검색 (부분 일치)
 *       - in: query
 *         name: actorName
 *         schema:
 *           type: string
 *         description: 배우명 검색 (부분 일치, casting 배열 내 포함 여부)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: 페이지 번호
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 100
 *         description: 페이지당 항목 수
 *     responses:
 *       200:
 *         description: 티켓 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Ticket'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       description: 전체 티켓 수
 *                     page:
 *                       type: integer
 *                       description: 현재 페이지 번호
 *                     limit:
 *                       type: integer
 *                       description: 페이지당 항목 수
 *                     totalPages:
 *                       type: integer
 *                       description: 전체 페이지 수
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { year, genre, performanceName, actorName, page, limit } = req.query;

    const pagination = parsePagination(page, limit, 50);
    if (isPaginationError(pagination)) {
      res.status(400).json(pagination);
      return;
    }
    const { pageNum, limitNum } = pagination;

    const where: Prisma.TicketWhereInput = { userId };

    if (year) {
      where.date = { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) };
    }

    if (genre) {
      const genreEnum = parseGenre(genre as string);
      if (genreEnum !== null) where.genre = genreEnum;
    }

    if (performanceName) {
      where.performanceName = { contains: performanceName as string };
    }

    if (actorName) {
      where.castings = { some: { actorName: { contains: actorName as string } } };
    }

    const [total, tickets] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        include: { castings: { select: { actorName: true } } },
        orderBy: { date: "desc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
    ]);

    res.json({
      data: tickets.map(formatTicketResponse),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("티켓 목록 조회 오류:", error);
    res.status(500).json({
      error: "티켓 목록을 가져오는 중 오류가 발생했습니다.",
      code: "GET_TICKETS_ERROR",
    });
  }
});

/**
 * @openapi
 * /api/tickets:
 *   post:
 *     summary: 티켓 생성
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - date
 *               - time
 *               - performanceName
 *               - theater
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2024-01-15"
 *               time:
 *                 type: string
 *                 format: time
 *                 example: "19:30:00"
 *               performanceName:
 *                 type: string
 *               genre:
 *                 type: string
 *                 enum: [연극, 뮤지컬]
 *               isChild:
 *                 type: boolean
 *                 default: false
 *               theater:
 *                 type: string
 *               seat:
 *                 type: string
 *               ticketPrice:
 *                 type: integer
 *                 default: 0
 *               companion:
 *                 type: string
 *               mdPrice:
 *                 type: integer
 *                 default: 0
 *               rating:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 5
 *                 default: 0
 *               review:
 *                 type: string
 *               posterUrl:
 *                 type: string
 *               casting:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: 티켓 생성 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 id:
 *                   type: string
 *                   format: uuid
 *       400:
 *         description: 필수 필드 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const {
      date,
      time,
      performanceName,
      genre,
      isChild,
      theater,
      seat,
      ticketPrice,
      companion,
      mdPrice,
      rating,
      review,
      posterUrl,
      casting,
    } = req.body;

    if (!date || !time || !performanceName || !theater) {
      res.status(400).json({
        error: "필수 필드(date, time, performanceName, theater)가 필요합니다.",
        code: "MISSING_FIELDS",
      });
      return;
    }

    const ticket = await prisma.ticket.create({
      data: {
        id: uuidv4(),
        userId,
        date: parseDate(date),
        time: parseTime(time),
        performanceName,
        genre: parseGenre(genre),
        isChild: isChild || false,
        theater,
        seat: seat || null,
        ticketPrice: ticketPrice || 0,
        companion: companion || null,
        mdPrice: mdPrice || 0,
        rating: rating || 0,
        review: review || null,
        posterUrl: posterUrl || null,
        castings:
          casting && Array.isArray(casting)
            ? { create: casting.map((actorName: string) => ({ actorName })) }
            : undefined,
      },
      include: { castings: { select: { actorName: true } } },
    });

    res.status(201).json({ message: "티켓이 생성되었습니다.", id: ticket.id });
  } catch (error) {
    console.error("티켓 생성 오류:", error);
    res.status(500).json({
      error: "티켓 생성 중 오류가 발생했습니다.",
      code: "CREATE_TICKET_ERROR",
    });
  }
});

/**
 * @openapi
 * /api/tickets/{id}:
 *   put:
 *     summary: 티켓 수정
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: "티켓 ID"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *               time:
 *                 type: string
 *                 format: time
 *               performanceName:
 *                 type: string
 *               genre:
 *                 type: string
 *                 enum: [연극, 뮤지컬]
 *               isChild:
 *                 type: boolean
 *               theater:
 *                 type: string
 *               seat:
 *                 type: string
 *               ticketPrice:
 *                 type: integer
 *               companion:
 *                 type: string
 *               mdPrice:
 *                 type: integer
 *               rating:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 5
 *               review:
 *                 type: string
 *               posterUrl:
 *                 type: string
 *               casting:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: "티켓 수정 성공"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: "티켓을 찾을 수 없습니다"
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
router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const existingTicket = await prisma.ticket.findFirst({ where: { id, userId } });
    if (!existingTicket) {
      res.status(404).json({ error: "티켓을 찾을 수 없습니다.", code: "TICKET_NOT_FOUND" });
      return;
    }

    const updateData: Prisma.TicketUpdateInput = {};
    const body = req.body;

    if (body.date !== undefined) updateData.date = parseDate(body.date);
    if (body.time !== undefined) updateData.time = parseTime(body.time);
    if (body.performanceName !== undefined) updateData.performanceName = body.performanceName;
    if (body.genre !== undefined) updateData.genre = parseGenre(body.genre);
    if (body.isChild !== undefined) updateData.isChild = body.isChild;
    if (body.theater !== undefined) updateData.theater = body.theater;
    if (body.seat !== undefined) updateData.seat = body.seat;
    if (body.ticketPrice !== undefined) updateData.ticketPrice = body.ticketPrice;
    if (body.companion !== undefined) updateData.companion = body.companion;
    if (body.mdPrice !== undefined) updateData.mdPrice = body.mdPrice;
    if (body.rating !== undefined) updateData.rating = body.rating;
    if (body.review !== undefined) updateData.review = body.review;
    if (body.posterUrl !== undefined) updateData.posterUrl = body.posterUrl;

    await prisma.ticket.update({ where: { id }, data: updateData });

    if (body.casting !== undefined && Array.isArray(body.casting)) {
      await prisma.ticketCasting.deleteMany({ where: { ticketId: id } });
      if (body.casting.length > 0) {
        await prisma.ticketCasting.createMany({
          data: body.casting.map((actorName: string) => ({ ticketId: id, actorName })),
        });
      }
    }

    res.json({ message: "티켓이 수정되었습니다." });
  } catch (error) {
    console.error("티켓 수정 오류:", error);
    res.status(500).json({
      error: "티켓 수정 중 오류가 발생했습니다.",
      code: "UPDATE_TICKET_ERROR",
    });
  }
});

/**
 * @openapi
 * /api/tickets/{id}:
 *   delete:
 *     summary: 티켓 삭제
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: "티켓 ID"
 *     responses:
 *       200:
 *         description: "티켓 삭제 성공"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: "티켓을 찾을 수 없습니다"
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
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const ticket = await prisma.ticket.findFirst({ where: { id, userId } });
    if (!ticket) {
      res.status(404).json({ error: "티켓을 찾을 수 없습니다.", code: "TICKET_NOT_FOUND" });
      return;
    }

    await prisma.ticket.delete({ where: { id } });
    res.json({ message: "티켓이 삭제되었습니다." });
  } catch (error) {
    console.error("티켓 삭제 오류:", error);
    res.status(500).json({
      error: "티켓 삭제 중 오류가 발생했습니다.",
      code: "DELETE_TICKET_ERROR",
    });
  }
});

/**
 * @openapi
 * /api/tickets/month:
 *   get:
 *     summary: 달력용 달별 티켓 조회
 *     description: 이전달 마지막 주, 해당 달, 다음달 첫 주를 포함하여 조회합니다.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: yearMonth
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{4}-\d{2}$'
 *         description: "연도-월 (YYYY-MM 형식, 예: 2024-01)"
 *     responses:
 *       200:
 *         description: 날짜별로 그룹화된 티켓 목록
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
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       posterUrl:
 *                         type: string
 *                         nullable: true
 *                       date:
 *                         type: string
 *                         format: date
 *                       time:
 *                         type: string
 *                         format: time
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/month", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { yearMonth } = req.query;

    if (!yearMonth || typeof yearMonth !== "string") {
      res.status(400).json({
        error: "yearMonth 쿼리 파라미터가 필요합니다. (예: 2024-01)",
        code: "MISSING_YEAR_MONTH",
      });
      return;
    }

    const yearMonthMatch = yearMonth.match(/^(\d{4})-(\d{2})$/);
    if (!yearMonthMatch) {
      res.status(400).json({
        error: "yearMonth는 YYYY-MM 형식이어야 합니다. (예: 2024-01)",
        code: "INVALID_YEAR_MONTH_FORMAT",
      });
      return;
    }

    const year = parseInt(yearMonthMatch[1], 10);
    const month = parseInt(yearMonthMatch[2], 10);

    if (month < 1 || month > 12) {
      res.status(400).json({ error: "월은 1-12 사이의 값이어야 합니다.", code: "INVALID_MONTH" });
      return;
    }

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    const calendarStart = new Date(firstDay);
    calendarStart.setDate(calendarStart.getDate() - firstDay.getDay());

    const calendarEnd = new Date(lastDay);
    calendarEnd.setDate(calendarEnd.getDate() + (6 - lastDay.getDay()));

    const startDate = new Date(
      Date.UTC(calendarStart.getFullYear(), calendarStart.getMonth(), calendarStart.getDate())
    );
    const endDate = new Date(
      Date.UTC(calendarEnd.getFullYear(), calendarEnd.getMonth(), calendarEnd.getDate(), 23, 59, 59, 999)
    );

    const tickets = await prisma.ticket.findMany({
      where: { userId, date: { gte: startDate, lte: endDate } },
      select: { id: true, posterUrl: true, date: true, time: true },
      orderBy: [{ date: "asc" }, { time: "asc" }],
    });

    res.json({
      data: tickets.map((ticket) => ({
        id: ticket.id,
        posterUrl: ticket.posterUrl,
        date: formatDate(ticket.date),
        time: formatTime(ticket.time),
      })),
    });
  } catch (error) {
    console.error("달별 티켓 조회 오류:", error);
    res.status(500).json({
      error: "달별 티켓 조회 중 오류가 발생했습니다.",
      code: "GET_TICKETS_BY_MONTH_ERROR",
    });
  }
});

/**
 * @openapi
 * /api/tickets/{id}:
 *   get:
 *     summary: 티켓 상세 조회
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: "티켓 ID"
 *     responses:
 *       200:
 *         description: "티켓 상세 정보"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ticket'
 *       404:
 *         description: "티켓을 찾을 수 없습니다"
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
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const ticket = await prisma.ticket.findFirst({
      where: { id, userId },
      include: { castings: { select: { actorName: true } } },
    });

    if (!ticket) {
      res.status(404).json({ error: "티켓을 찾을 수 없습니다.", code: "TICKET_NOT_FOUND" });
      return;
    }

    res.json(formatTicketResponse(ticket));
  } catch (error) {
    console.error("티켓 상세 조회 오류:", error);
    res.status(500).json({
      error: "티켓 정보를 가져오는 중 오류가 발생했습니다.",
      code: "GET_TICKET_ERROR",
    });
  }
});

export default router;
