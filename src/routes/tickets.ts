import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { deleteCloudinaryImage } from "../lib/cloudinary";
import { v4 as uuidv4 } from "uuid";
import {
  parseDate,
  parseTime,
  formatDate,
  formatTime,
  parseGenre,
  formatGenre,
  formatActorDomain,
  parsePagination,
  isPaginationError,
} from "../lib/utils";

const router = Router();

// 모든 티켓 라우트는 인증 필요
router.use(authenticate);

type TicketWithActors = Prisma.TicketGetPayload<{
  include: {
    ticketActors: {
      select: {
        actor: { select: { id: true; name: true; domain: true; status: true } };
      };
    };
  };
}>;

/**
 * 티켓 데이터를 응답 형식으로 변환
 */
const formatTicketResponse = (ticket: TicketWithActors) => {
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
    isLinked: ticket.isLinked,
    kopisId: ticket.kopisId,
    casting: ticket.ticketActors.map((ta) => ({
      id: ta.actor.id,
      name: ta.actor.name,
      domain: formatActorDomain(ta.actor.domain),
      status: ta.actor.status,
    })),
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
};

const ticketActorsInclude = {
  ticketActors: {
    select: {
      actor: { select: { id: true, name: true, domain: true, status: true } },
    },
  },
} as const;

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
 *         description: 배우명 검색 (부분 일치)
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
 *           default: 50
 *           minimum: 1
 *           maximum: 100
 *     responses:
 *       200:
 *         description: 티켓 목록
 *       401:
 *         description: 인증 실패
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
      where.ticketActors = { some: { actor: { name: { contains: actorName as string } } } };
    }

    const [total, tickets] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        include: ticketActorsInclude,
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
 *               castingIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: 배우 ID 배열
 *     responses:
 *       201:
 *         description: 티켓 생성 성공
 *       400:
 *         description: 필수 필드 누락
 *       401:
 *         description: 인증 실패
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
      isLinked,
      kopisId,
      castingIds,
    } = req.body;

    if (!date || !time) {
      res.status(400).json({
        error: "필수 필드(date, time)가 필요합니다.",
        code: "MISSING_FIELDS",
      });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isFutureDate = new Date(date) > today;

    if (!isFutureDate && (!performanceName || !theater)) {
      res.status(400).json({
        error: "필수 필드(performanceName, theater)가 필요합니다.",
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
        performanceName: performanceName || "",
        genre: parseGenre(genre),
        isChild: isChild || false,
        theater: theater || "",
        seat: seat || null,
        ticketPrice: ticketPrice || 0,
        companion: companion || null,
        mdPrice: mdPrice || 0,
        rating: rating || 0,
        review: review || null,
        posterUrl: posterUrl || null,
        isLinked: isLinked || false,
        kopisId: kopisId || null,
        ticketActors:
          castingIds && Array.isArray(castingIds) && castingIds.length > 0
            ? { create: castingIds.map((actorId: string) => ({ actorId })) }
            : undefined,
      },
      include: ticketActorsInclude,
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
 *               castingIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: "배우 ID 배열 (포함 시 기존 캐스팅 전체 교체)"
 *     responses:
 *       200:
 *         description: 티켓 수정 성공
 *       404:
 *         description: 티켓을 찾을 수 없습니다
 *       401:
 *         description: 인증 실패
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
    if (body.posterUrl !== undefined) {
      if (existingTicket.posterUrl && existingTicket.posterUrl !== body.posterUrl) {
        await deleteCloudinaryImage(existingTicket.posterUrl);
      }
      updateData.posterUrl = body.posterUrl;
    }
    if (body.isLinked !== undefined) updateData.isLinked = body.isLinked;
    if (body.kopisId !== undefined) updateData.kopisId = body.kopisId;

    await prisma.ticket.update({ where: { id }, data: updateData });

    if (body.castingIds !== undefined && Array.isArray(body.castingIds)) {
      await prisma.ticketActor.deleteMany({ where: { ticketId: id } });
      if (body.castingIds.length > 0) {
        await prisma.ticketActor.createMany({
          data: body.castingIds.map((actorId: string) => ({ ticketId: id, actorId })),
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
 *     responses:
 *       200:
 *         description: 티켓 삭제 성공
 *       404:
 *         description: 티켓을 찾을 수 없습니다
 *       401:
 *         description: 인증 실패
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

    if (ticket.posterUrl) {
      await deleteCloudinaryImage(ticket.posterUrl);
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
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 실패
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
 *     responses:
 *       200:
 *         description: 티켓 상세 정보
 *       404:
 *         description: 티켓을 찾을 수 없습니다
 *       401:
 *         description: 인증 실패
 */
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const ticket = await prisma.ticket.findFirst({
      where: { id, userId },
      include: ticketActorsInclude,
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
