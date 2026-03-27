import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { authenticate } from "../middleware/auth";

const router = Router();

const JWT_SECRET: string = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || "15m";
const REFRESH_TOKEN_SECRET: string =
  process.env.REFRESH_TOKEN_SECRET || "your-refresh-secret-key";
const REFRESH_TOKEN_EXPIRES_IN: string =
  process.env.REFRESH_TOKEN_EXPIRES_IN || "7d";
const GOOGLE_CLIENT_ID: string = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const generateAccessToken = (userId: string, username: string): string => {
  return jwt.sign({ userId, username }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
};

const generateRefreshToken = (userId: string): string => {
  return jwt.sign({ userId }, REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  } as jwt.SignOptions);
};

/**
 * "7d", "30d", "24h", "60m" 형식의 문자열을 밀리초로 변환
 */
const parseExpiresInMs = (expiresIn: string): number => {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // 파싱 실패 시 기본값 7일
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * multipliers[unit];
};

const setRefreshTokenCookie = (res: Response, refreshToken: string): void => {
  const maxAge = parseExpiresInMs(REFRESH_TOKEN_EXPIRES_IN);
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge,
    path: "/api/auth",
  });
};

/**
 * @openapi
 * /api/auth/signup:
 *   post:
 *     summary: 회원가입
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *               - nickname
 *             properties:
 *               username:
 *                 type: string
 *                 description: 사용자명
 *               password:
 *                 type: string
 *                 description: 비밀번호
 *               nickname:
 *                 type: string
 *                 description: 닉네임
 *     responses:
 *       201:
 *         description: 회원가입 성공 (access_token 반환, refresh_token은 httpOnly 쿠키로 설정)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 access_token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: 필수 필드 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: 사용자명 중복
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/signup", async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, nickname } = req.body;

    if (!username || !password || !nickname) {
      res.status(400).json({
        error: "모든 필드(username, password, nickname)가 필요합니다.",
        code: "MISSING_FIELDS",
      });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      res.status(409).json({
        error: "이미 사용 중인 사용자명입니다.",
        code: "USERNAME_EXISTS",
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, password: hashedPassword, nickname },
      select: { id: true, username: true, nickname: true, createdAt: true },
    });

    const accessToken = generateAccessToken(user.id, user.username);
    const refreshToken = generateRefreshToken(user.id);

    const decoded = jwt.decode(refreshToken) as jwt.JwtPayload;
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(decoded.exp! * 1000),
      },
    });

    setRefreshTokenCookie(res, refreshToken);

    res.status(201).json({
      message: "회원가입이 완료되었습니다.",
      access_token: accessToken,
      user: { id: user.id, username: user.username, nickname: user.nickname },
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
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: 로그인
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: 사용자명
 *               password:
 *                 type: string
 *                 description: 비밀번호
 *     responses:
 *       200:
 *         description: 로그인 성공 (access_token 반환, refresh_token은 httpOnly 쿠키로 설정)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 access_token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({
        error: "username과 password가 필요합니다.",
        code: "MISSING_FIELDS",
      });
      return;
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      res.status(401).json({
        error: "사용자명 또는 비밀번호가 올바르지 않습니다.",
        code: "INVALID_CREDENTIALS",
      });
      return;
    }

    if (user.provider !== "local") {
      res.status(401).json({
        error: "소셜 로그인으로 가입된 계정입니다. 해당 소셜 로그인을 이용해주세요.",
        code: "SOCIAL_ACCOUNT",
      });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password!);
    if (!isPasswordValid) {
      res.status(401).json({
        error: "사용자명 또는 비밀번호가 올바르지 않습니다.",
        code: "INVALID_CREDENTIALS",
      });
      return;
    }

    const accessToken = generateAccessToken(user.id, user.username);
    const refreshToken = generateRefreshToken(user.id);

    const decoded = jwt.decode(refreshToken) as jwt.JwtPayload;
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(decoded.exp! * 1000),
      },
    });

    setRefreshTokenCookie(res, refreshToken);

    res.json({
      message: "로그인 성공",
      access_token: accessToken,
      user: { id: user.id, username: user.username, nickname: user.nickname },
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
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     summary: Access token 재발급
 *     tags: [Auth]
 *     description: httpOnly 쿠키의 refresh_token을 사용해 새 access_token을 발급합니다. refresh_token도 rotation됩니다.
 *     responses:
 *       200:
 *         description: 토큰 재발급 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token:
 *                   type: string
 *       401:
 *         description: 유효하지 않거나 만료된 refresh_token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/refresh", async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshToken: string | undefined = req.cookies?.refresh_token;

    if (!refreshToken) {
      res.status(401).json({
        error: "Refresh token이 없습니다.",
        code: "NO_REFRESH_TOKEN",
      });
      return;
    }

    // JWT 서명 및 만료 검증
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET) as jwt.JwtPayload;
    } catch {
      res.clearCookie("refresh_token", { path: "/api/auth" });
      res.status(401).json({
        error: "유효하지 않거나 만료된 refresh token입니다.",
        code: "INVALID_REFRESH_TOKEN",
      });
      return;
    }

    // DB에서 토큰 존재 여부 확인 (revocation 체크)
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!storedToken) {
      res.clearCookie("refresh_token", { path: "/api/auth" });
      res.status(401).json({
        error: "유효하지 않거나 만료된 refresh token입니다.",
        code: "INVALID_REFRESH_TOKEN",
      });
      return;
    }

    // 사용자 조회
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, username: true },
    });

    if (!user) {
      await prisma.refreshToken.delete({ where: { token: refreshToken } });
      res.clearCookie("refresh_token", { path: "/api/auth" });
      res.status(401).json({
        error: "사용자를 찾을 수 없습니다.",
        code: "USER_NOT_FOUND",
      });
      return;
    }

    // Refresh token rotation: 기존 토큰 삭제 후 새 토큰 발급
    const newRefreshToken = generateRefreshToken(user.id);
    const decoded = jwt.decode(newRefreshToken) as jwt.JwtPayload;

    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { token: refreshToken } }),
      prisma.refreshToken.create({
        data: {
          token: newRefreshToken,
          userId: user.id,
          expiresAt: new Date(decoded.exp! * 1000),
        },
      }),
    ]);

    setRefreshTokenCookie(res, newRefreshToken);

    const accessToken = generateAccessToken(user.id, user.username);
    res.json({ access_token: accessToken });
  } catch (error) {
    console.error("토큰 갱신 오류:", error);
    res.status(500).json({
      error: "토큰 갱신 중 오류가 발생했습니다.",
      code: "REFRESH_ERROR",
    });
  }
});

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: 로그아웃
 *     tags: [Auth]
 *     description: refresh_token 쿠키를 무효화하고 DB에서 삭제합니다.
 *     responses:
 *       200:
 *         description: 로그아웃 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post("/logout", async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshToken: string | undefined = req.cookies?.refresh_token;

    if (refreshToken) {
      await prisma.refreshToken
        .delete({ where: { token: refreshToken } })
        .catch(() => {
          // 이미 삭제된 토큰이면 무시
        });
    }

    res.clearCookie("refresh_token", { path: "/api/auth" });
    res.json({ message: "로그아웃 되었습니다." });
  } catch (error) {
    console.error("로그아웃 오류:", error);
    res.status(500).json({
      error: "로그아웃 중 오류가 발생했습니다.",
      code: "LOGOUT_ERROR",
    });
  }
});

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: 현재 사용자 정보 조회
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 사용자 정보
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
        select: { id: true, username: true, nickname: true, createdAt: true },
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

/**
 * @openapi
 * /api/auth/google:
 *   post:
 *     summary: 구글 소셜 로그인
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - credential
 *             properties:
 *               credential:
 *                 type: string
 *                 description: Google ID Token (JWT)
 *     responses:
 *       200:
 *         description: 구글 로그인 성공 (access_token 반환, refresh_token은 httpOnly 쿠키로 설정)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 access_token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: credential 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 유효하지 않은 Google 인증
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/google", async (req: Request, res: Response): Promise<void> => {
  try {
    const { credential } = req.body;

    if (!credential) {
      res.status(400).json({
        error: "Google credential이 필요합니다.",
        code: "MISSING_CREDENTIAL",
      });
      return;
    }

    // Google ID Token 검증
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      res.status(401).json({
        error: "유효하지 않은 Google 인증입니다.",
        code: "INVALID_GOOGLE_TOKEN",
      });
      return;
    }

    if (!payload || !payload.email || !payload.sub) {
      res.status(401).json({
        error: "유효하지 않은 Google 인증입니다.",
        code: "INVALID_GOOGLE_TOKEN",
      });
      return;
    }

    const { email, name, sub } = payload;

    // 기존 Google 사용자 조회 (provider + providerId)
    let user = await prisma.user.findFirst({
      where: { provider: "google", providerId: sub },
      select: { id: true, username: true, nickname: true },
    });

    if (!user) {
      // 동일 email로 가입된 local 계정이 있는지 확인
      const existingLocalUser = await prisma.user.findUnique({
        where: { username: email },
      });

      if (existingLocalUser && existingLocalUser.provider === "local") {
        res.status(409).json({
          error: "이미 일반 회원가입으로 등록된 이메일입니다. 기존 계정으로 로그인해주세요.",
          code: "EMAIL_EXISTS_LOCAL",
        });
        return;
      }

      // 새 사용자 생성
      const username = existingLocalUser ? `google_${sub}` : email;
      user = await prisma.user.create({
        data: {
          username,
          password: null,
          nickname: name || email.split("@")[0],
          provider: "google",
          providerId: sub,
          email,
        },
        select: { id: true, username: true, nickname: true },
      });
    }

    // JWT 발급
    const accessToken = generateAccessToken(user.id, user.username);
    const refreshToken = generateRefreshToken(user.id);

    const decoded = jwt.decode(refreshToken) as jwt.JwtPayload;
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(decoded.exp! * 1000),
      },
    });

    setRefreshTokenCookie(res, refreshToken);

    res.json({
      message: "구글 로그인 성공",
      access_token: accessToken,
      user: { id: user.id, username: user.username, nickname: user.nickname },
    });
  } catch (error) {
    console.error("구글 로그인 오류:", error);
    res.status(500).json({
      error: "구글 로그인 처리 중 오류가 발생했습니다.",
      code: "GOOGLE_LOGIN_ERROR",
    });
  }
});

export default router;
