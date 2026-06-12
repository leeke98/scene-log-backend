import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// jsonwebtoken / prisma는 외부 의존성이므로 모킹한다.
vi.mock("jsonwebtoken", () => ({
  default: { verify: vi.fn() },
}));
vi.mock("../lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { authenticate, authenticateAdmin } from "../middleware/auth";

const mockVerify = vi.mocked(jwt.verify);
const mockFindUnique = vi.mocked(prisma.user.findUnique);

// ─── 테스트 헬퍼 ──────────────────────────────────────────────────────────────

function createReq(authHeader?: string): Request {
  return {
    headers: authHeader === undefined ? {} : { authorization: authHeader },
  } as Request;
}

/** status()/json()이 체이닝되는 최소 Response 목 객체 */
function createRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const VALID_PAYLOAD = { userId: "user-1", username: "tester" };

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── authenticate ─────────────────────────────────────────────────────────────

describe("authenticate", () => {
  it("Authorization 헤더가 없으면 401 UNAUTHORIZED를 반환한다", () => {
    const req = createReq();
    const res = createRes();
    const next = vi.fn() as NextFunction;

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "UNAUTHORIZED" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("'Bearer '로 시작하지 않으면 401 UNAUTHORIZED를 반환한다", () => {
    const req = createReq("Token abc");
    const res = createRes();
    const next = vi.fn() as NextFunction;

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "UNAUTHORIZED" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("토큰 검증에 실패하면 401 INVALID_TOKEN을 반환한다", () => {
    mockVerify.mockImplementation(() => {
      throw new Error("invalid signature");
    });
    const req = createReq("Bearer bad-token");
    const res = createRes();
    const next = vi.fn() as NextFunction;

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INVALID_TOKEN" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("유효한 토큰이면 req에 userId/username을 붙이고 next를 호출한다", () => {
    mockVerify.mockReturnValue(VALID_PAYLOAD as never);
    const req = createReq("Bearer good-token");
    const res = createRes();
    const next = vi.fn() as NextFunction;

    authenticate(req, res, next);

    expect(req.userId).toBe("user-1");
    expect(req.username).toBe("tester");
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─── authenticateAdmin ──────────────────────────────────────────────────────────

describe("authenticateAdmin", () => {
  it("토큰이 없으면 401을 반환하고 DB를 조회하지 않는다", async () => {
    const req = createReq();
    const res = createRes();
    const next = vi.fn() as NextFunction;

    await authenticateAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("유효한 토큰이지만 관리자가 아니면 403 FORBIDDEN을 반환한다", async () => {
    mockVerify.mockReturnValue(VALID_PAYLOAD as never);
    mockFindUnique.mockResolvedValue({ isAdmin: false } as never);
    const req = createReq("Bearer good-token");
    const res = createRes();
    const next = vi.fn() as NextFunction;

    await authenticateAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "FORBIDDEN" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("사용자를 찾지 못하면 403 FORBIDDEN을 반환한다", async () => {
    mockVerify.mockReturnValue(VALID_PAYLOAD as never);
    mockFindUnique.mockResolvedValue(null as never);
    const req = createReq("Bearer good-token");
    const res = createRes();
    const next = vi.fn() as NextFunction;

    await authenticateAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("관리자면 req에 정보를 붙이고 next를 호출한다", async () => {
    mockVerify.mockReturnValue(VALID_PAYLOAD as never);
    mockFindUnique.mockResolvedValue({ isAdmin: true } as never);
    const req = createReq("Bearer good-token");
    const res = createRes();
    const next = vi.fn() as NextFunction;

    await authenticateAdmin(req, res, next);

    expect(req.userId).toBe("user-1");
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
