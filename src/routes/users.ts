import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import bcrypt from "bcrypt";

const router = Router();

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: 새 사용자 생성
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/CreateUserRequest"
 *     responses:
 *       201:
 *         description: 사용자가 성공적으로 생성되었습니다.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/CreateUserResponse"
 *       400:
 *         description: 필수 필드가 누락되었습니다.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *             example:
 *               error: "모든 필드(username, password, nickname)가 필요합니다."
 *       409:
 *         description: 이미 사용 중인 사용자명입니다.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *             example:
 *               error: "이미 사용 중인 사용자명입니다."
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
// 사용자 생성
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, nickname } = req.body;

    // 입력 검증
    if (!username || !password || !nickname) {
      res.status(400).json({
        error: "모든 필드(username, password, nickname)가 필요합니다.",
      });
      return;
    }

    // 사용자명 중복 확인
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      res.status(409).json({
        error: "이미 사용 중인 사용자명입니다.",
      });
      return;
    }

    // 비밀번호 해싱
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 사용자 생성
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        nickname,
      },
      select: {
        id: true,
        username: true,
        nickname: true,
        createdAt: true,
        // password는 제외
      },
    });

    res.status(201).json({
      message: "사용자가 성공적으로 생성되었습니다.",
      user,
    });
  } catch (error) {
    console.error("사용자 생성 오류:", error);
    res.status(500).json({
      error: "사용자 생성 중 오류가 발생했습니다.",
    });
  }
});

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: 사용자 목록 조회
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: 사용자 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: "#/components/schemas/User"
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
// 사용자 목록 조회
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        nickname: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(users);
  } catch (error) {
    console.error("사용자 목록 조회 오류:", error);
    res.status(500).json({
      error: "사용자 목록을 가져오는 중 오류가 발생했습니다.",
    });
  }
});

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: 특정 사용자 조회
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 사용자 고유 ID
 *     responses:
 *       200:
 *         description: 사용자 정보 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/User"
 *       404:
 *         description: 사용자를 찾을 수 없습니다.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *             example:
 *               error: "사용자를 찾을 수 없습니다."
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
// 특정 사용자 조회
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        nickname: true,
        createdAt: true,
        updatedAt: true,
        // tickets: {
        //   select: {
        //     id: true,
        //     performanceName: true,
        //     date: true,
        //     theater: true,
        //   },
        // },
      },
    });

    if (!user) {
      res.status(404).json({
        error: "사용자를 찾을 수 없습니다.",
      });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error("사용자 조회 오류:", error);
    res.status(500).json({
      error: "사용자 정보를 가져오는 중 오류가 발생했습니다.",
    });
  }
});

export default router;
