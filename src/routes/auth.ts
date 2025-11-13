import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { authenticate } from "../middleware/auth";

const router = Router();

const JWT_SECRET: string = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || "7d";

/**
 * JWT 토큰 생성 헬퍼 함수
 */
const generateToken = (userId: string, username: string): string => {
  return jwt.sign({ userId, username }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
};

/**
 * POST /api/auth/signup
 * 회원가입
 */
router.post("/signup", async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, nickname } = req.body;

    // 입력 검증
    if (!username || !password || !nickname) {
      res.status(400).json({
        error: "모든 필드(username, password, nickname)가 필요합니다.",
        code: "MISSING_FIELDS",
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
        code: "USERNAME_EXISTS",
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
      },
    });

    // JWT 토큰 생성
    const token = generateToken(user.id, user.username);

    res.status(201).json({
      message: "회원가입이 완료되었습니다.",
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
      },
    });
  } catch (error) {
    console.error("회원가입 오류:", error);
    res.status(500).json({
      error: "회원가입 중 오류가 발생했습니다.",
      code: "SIGNUP_ERROR",
    });
  }
});

/**
 * POST /api/auth/login
 * 로그인
 */
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    // 입력 검증
    if (!username || !password) {
      res.status(400).json({
        error: "username과 password가 필요합니다.",
        code: "MISSING_FIELDS",
      });
      return;
    }

    // 사용자 조회
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      res.status(401).json({
        error: "사용자명 또는 비밀번호가 올바르지 않습니다.",
        code: "INVALID_CREDENTIALS",
      });
      return;
    }

    // 비밀번호 검증
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      res.status(401).json({
        error: "사용자명 또는 비밀번호가 올바르지 않습니다.",
        code: "INVALID_CREDENTIALS",
      });
      return;
    }

    // JWT 토큰 생성
    const token = generateToken(user.id, user.username);

    res.json({
      message: "로그인 성공",
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
      },
    });
  } catch (error) {
    console.error("로그인 오류:", error);
    res.status(500).json({
      error: "로그인 중 오류가 발생했습니다.",
      code: "LOGIN_ERROR",
    });
  }
});

/**
 * GET /api/auth/me
 * 현재 사용자 정보 조회
 */
router.get(
  "/me",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({
          error: "인증 정보를 찾을 수 없습니다.",
          code: "UNAUTHORIZED",
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          nickname: true,
          createdAt: true,
        },
      });

      if (!user) {
        res.status(404).json({
          error: "사용자를 찾을 수 없습니다.",
          code: "USER_NOT_FOUND",
        });
        return;
      }

      res.json(user);
    } catch (error) {
      console.error("사용자 정보 조회 오류:", error);
      res.status(500).json({
        error: "사용자 정보를 가져오는 중 오류가 발생했습니다.",
        code: "GET_USER_ERROR",
      });
    }
  }
);

export default router;
