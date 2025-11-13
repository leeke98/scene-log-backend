import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

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
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: "인증 토큰이 필요합니다.",
        code: "UNAUTHORIZED",
      });
      return;
    }

    const token = authHeader.substring(7); // "Bearer " 제거
    const jwtSecret = process.env.JWT_SECRET || "your-secret-key";

    try {
      const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
      req.userId = decoded.userId;
      req.username = decoded.username;
      next();
    } catch (error) {
      res.status(401).json({
        error: "유효하지 않은 토큰입니다.",
        code: "INVALID_TOKEN",
      });
      return;
    }
  } catch (error) {
    console.error("인증 미들웨어 오류:", error);
    res.status(500).json({
      error: "인증 처리 중 오류가 발생했습니다.",
      code: "AUTH_ERROR",
    });
    return;
  }
};
