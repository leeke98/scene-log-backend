import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";
import { Genre } from "@prisma/client";

const router = Router();

// 모든 티켓 라우트는 인증 필요
router.use(authenticate);

/**
 * 날짜 문자열을 Date 객체로 변환 (YYYY-MM-DD)
 */
const parseDate = (dateString: string): Date => {
  return new Date(dateString + "T00:00:00.000Z");
};

/**
 * 시간 문자열을 Date 객체로 변환 (HH:MM:SS)
 */
const parseTime = (timeString: string): Date => {
  const [hours, minutes, seconds] = timeString.split(":").map(Number);
  const date = new Date();
  date.setUTCHours(hours, minutes, seconds || 0, 0);
  return date;
};

/**
 * Date 객체를 YYYY-MM-DD 형식 문자열로 변환
 */
const formatDate = (date: Date): string => {
  return date.toISOString().split("T")[0];
};

/**
 * Date 객체를 HH:MM:SS 형식 문자열로 변환
 */
const formatTime = (date: Date): string => {
  const hours = date.getUTCHours().toString().padStart(2, "0");
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const seconds = date.getUTCSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

/**
 * 티켓 데이터를 응답 형식으로 변환
 */
const formatTicketResponse = (ticket: any) => {
  return {
    id: ticket.id,
    date: formatDate(ticket.date),
    time: formatTime(ticket.time),
    performanceName: ticket.performanceName,
    genre:
      ticket.genre === Genre.THEATER
        ? "연극"
        : ticket.genre === Genre.MUSICAL
        ? "뮤지컬"
        : null,
    isChild: ticket.isChild,
    theater: ticket.theater,
    seat: ticket.seat,
    ticketPrice: ticket.ticketPrice,
    companion: ticket.companion,
    mdPrice: ticket.mdPrice,
    rating: ticket.rating,
    review: ticket.review,
    posterUrl: ticket.posterUrl,
    casting: ticket.castings?.map((c: any) => c.actorName) || [],
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
    const { year, genre, performanceName, page, limit } = req.query;

    // 페이징 파라미터 파싱 및 기본값 설정
    const pageNum = parseInt((page as string) || "1", 10);
    const limitNum = parseInt((limit as string) || "50", 10);

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

    const skip = (pageNum - 1) * limitNum;

    // 필터 조건 구성
    const where: any = {
      userId,
    };

    if (year) {
      // 연도 필터
      const startDate = new Date(`${year}-01-01`);
      const endDate = new Date(`${year}-12-31`);
      where.date = {
        gte: startDate,
        lte: endDate,
      };
    }

    if (genre) {
      // 장르 필터
      if (genre === "연극") {
        where.genre = Genre.THEATER;
      } else if (genre === "뮤지컬") {
        where.genre = Genre.MUSICAL;
      }
    }

    if (performanceName) {
      // 작품명 검색 (부분 일치)
      where.performanceName = {
        contains: performanceName as string,
      };
    }

    // 전체 개수 조회
    const total = await prisma.ticket.count({ where });

    // 티켓 조회
    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        castings: {
          select: {
            actorName: true,
          },
        },
      },
      orderBy: {
        date: "desc",
      },
      skip,
      take: limitNum,
    });

    // 응답 형식으로 변환
    const formattedTickets = tickets.map(formatTicketResponse);

    // 페이징 정보 계산
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      data: formattedTickets,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
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

    // 필수 필드 검증
    if (!date || !time || !performanceName || !theater) {
      res.status(400).json({
        error: "필수 필드(date, time, performanceName, theater)가 필요합니다.",
        code: "MISSING_FIELDS",
      });
      return;
    }

    // 장르 변환
    let genreEnum: Genre | null = null;
    if (genre === "연극") {
      genreEnum = Genre.THEATER;
    } else if (genre === "뮤지컬") {
      genreEnum = Genre.MUSICAL;
    }

    // 티켓 ID 생성 (uuid 사용)
    const ticketId = uuidv4();

    // 티켓 생성
    const ticket = await prisma.ticket.create({
      data: {
        id: ticketId,
        userId,
        date: parseDate(date),
        time: parseTime(time),
        performanceName,
        genre: genreEnum,
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
            ? {
                create: casting.map((actorName: string) => ({
                  actorName,
                })),
              }
            : undefined,
      },
      include: {
        castings: {
          select: {
            actorName: true,
          },
        },
      },
    });

    res.status(201).json({
      message: "티켓이 생성되었습니다.",
      id: ticket.id,
    });
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
    const updateData: any = {};

    // 본인 티켓인지 확인
    const existingTicket = await prisma.ticket.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!existingTicket) {
      res.status(404).json({
        error: "티켓을 찾을 수 없습니다.",
        code: "TICKET_NOT_FOUND",
      });
      return;
    }

    // 업데이트할 필드만 추출
    if (req.body.date !== undefined) {
      updateData.date = parseDate(req.body.date);
    }
    if (req.body.time !== undefined) {
      updateData.time = parseTime(req.body.time);
    }
    if (req.body.performanceName !== undefined) {
      updateData.performanceName = req.body.performanceName;
    }
    if (req.body.genre !== undefined) {
      if (req.body.genre === "연극") {
        updateData.genre = Genre.THEATER;
      } else if (req.body.genre === "뮤지컬") {
        updateData.genre = Genre.MUSICAL;
      } else {
        updateData.genre = null;
      }
    }
    if (req.body.isChild !== undefined) {
      updateData.isChild = req.body.isChild;
    }
    if (req.body.theater !== undefined) {
      updateData.theater = req.body.theater;
    }
    if (req.body.seat !== undefined) {
      updateData.seat = req.body.seat;
    }
    if (req.body.ticketPrice !== undefined) {
      updateData.ticketPrice = req.body.ticketPrice;
    }
    if (req.body.companion !== undefined) {
      updateData.companion = req.body.companion;
    }
    if (req.body.mdPrice !== undefined) {
      updateData.mdPrice = req.body.mdPrice;
    }
    if (req.body.rating !== undefined) {
      updateData.rating = req.body.rating;
    }
    if (req.body.review !== undefined) {
      updateData.review = req.body.review;
    }
    if (req.body.posterUrl !== undefined) {
      updateData.posterUrl = req.body.posterUrl;
    }

    // 티켓 업데이트
    await prisma.ticket.update({
      where: { id },
      data: updateData,
    });

    // 캐스팅 정보 업데이트
    if (req.body.casting !== undefined && Array.isArray(req.body.casting)) {
      // 기존 캐스팅 삭제
      await prisma.ticketCasting.deleteMany({
        where: { ticketId: id },
      });

      // 새 캐스팅 생성
      if (req.body.casting.length > 0) {
        await prisma.ticketCasting.createMany({
          data: req.body.casting.map((actorName: string) => ({
            ticketId: id,
            actorName,
          })),
        });
      }
    }

    res.json({
      message: "티켓이 수정되었습니다.",
    });
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

    // 본인 티켓인지 확인
    const ticket = await prisma.ticket.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!ticket) {
      res.status(404).json({
        error: "티켓을 찾을 수 없습니다.",
        code: "TICKET_NOT_FOUND",
      });
      return;
    }

    // 티켓 삭제 (CASCADE로 캐스팅도 자동 삭제)
    await prisma.ticket.delete({
      where: { id },
    });

    res.json({
      message: "티켓이 삭제되었습니다.",
    });
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

    // YYYY-MM 형식 검증
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
      res.status(400).json({
        error: "월은 1-12 사이의 값이어야 합니다.",
        code: "INVALID_MONTH",
      });
      return;
    }

    // 해당 달의 첫 날과 마지막 날 계산
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0); // 다음 달의 0일 = 이번 달의 마지막 날

    // 달력에 표시할 시작일과 종료일 계산
    // 첫 날의 요일 (0=일요일, 1=월요일, ..., 6=토요일)
    const firstDayOfWeek = firstDay.getDay();
    // 마지막 날의 요일
    const lastDayOfWeek = lastDay.getDay();

    // 달력 시작일: 첫 날이 일요일이 아니면 이전달에서 가져옴
    const calendarStart = new Date(firstDay);
    calendarStart.setDate(calendarStart.getDate() - firstDayOfWeek);

    // 달력 종료일: 마지막 날이 토요일이 아니면 다음달에서 가져옴
    const calendarEnd = new Date(lastDay);
    const daysToAdd = 6 - lastDayOfWeek;
    calendarEnd.setDate(calendarEnd.getDate() + daysToAdd);

    // UTC로 변환하여 날짜 범위 조회
    const startDate = new Date(
      Date.UTC(
        calendarStart.getFullYear(),
        calendarStart.getMonth(),
        calendarStart.getDate()
      )
    );
    const endDate = new Date(
      Date.UTC(
        calendarEnd.getFullYear(),
        calendarEnd.getMonth(),
        calendarEnd.getDate(),
        23,
        59,
        59,
        999
      )
    );

    // 해당 기간의 티켓 조회
    const tickets = await prisma.ticket.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        posterUrl: true,
        date: true,
        time: true,
      },
      orderBy: [{ date: "asc" }, { time: "asc" }],
    });

    // 데이터 변환 및 정렬
    const data = tickets.map((ticket) => ({
      id: ticket.id,
      posterUrl: ticket.posterUrl,
      date: formatDate(ticket.date),
      time: formatTime(ticket.time),
    }));

    res.json({ data });
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
      where: {
        id,
        userId, // 본인 티켓만 조회 가능
      },
      include: {
        castings: {
          select: {
            actorName: true,
          },
        },
      },
    });

    if (!ticket) {
      res.status(404).json({
        error: "티켓을 찾을 수 없습니다.",
        code: "TICKET_NOT_FOUND",
      });
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
