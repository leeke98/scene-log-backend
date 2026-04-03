import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

// JWT 페이로드 타입 정의
interface JwtPayload {
  userId: string;
  username: string;
}

// Express Request에 userId 추가
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      username?: string;
    }
  }
}

const verifyToken = (authHeader: string | undefined): JwtPayload | null => {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.substring(7);
  const jwtSecret = process.env.JWT_SECRET || "your-secret-key";
  try {
    return jwt.verify(token, jwtSecret) as JwtPayload;
  } catch {
    return null;
  }
};

/**
 * JWT 인증 미들웨어
 * Authorization 헤더에서 Bearer 토큰을 추출하고 검증합니다.
 */
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const decoded = verifyToken(req.headers.authorization);
    if (!decoded) {
      const missing = !req.headers.authorization || !req.headers.authorization.startsWith("Bearer ");
      res.status(401).json({
        error: missing ? "인증 토큰이 필요합니다." : "유효하지 않은 토큰입니다.",
        code: missing ? "UNAUTHORIZED" : "INVALID_TOKEN",
      });
      return;
    }
    req.userId = decoded.userId;
    req.username = decoded.username;
    next();
  } catch (error) {
    console.error("인증 미들웨어 오류:", error);
    res.status(500).json({
      error: "인증 처리 중 오류가 발생했습니다.",
      code: "AUTH_ERROR",
    });
  }
};

/**
 * 어드민 전용 JWT 인증 미들웨어
 * 토큰 검증 후 DB에서 isAdmin 플래그를 확인합니다.
 */
export const authenticateAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const decoded = verifyToken(req.headers.authorization);
    if (!decoded) {
      const missing = !req.headers.authorization || !req.headers.authorization.startsWith("Bearer ");
      res.status(401).json({
        error: missing ? "인증 토큰이 필요합니다." : "유효하지 않은 토큰입니다.",
        code: missing ? "UNAUTHORIZED" : "INVALID_TOKEN",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { isAdmin: true },
    });

    if (!user || !user.isAdmin) {
      res.status(403).json({
        error: "관리자 권한이 필요합니다.",
        code: "FORBIDDEN",
      });
      return;
    }

    req.userId = decoded.userId;
    req.username = decoded.username;
    next();
  } catch (error) {
    console.error("어드민 인증 미들웨어 오류:", error);
    res.status(500).json({
      error: "인증 처리 중 오류가 발생했습니다.",
      code: "AUTH_ERROR",
    });
  }
};
