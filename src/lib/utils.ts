import { Genre, ActorDomain } from "@prisma/client";

// ─── 날짜 / 시간 변환 ──────────────────────────────────────────────────────────

/** "YYYY-MM-DD" 문자열 → Date 객체 */
export const parseDate = (dateString: string): Date => {
  return new Date(dateString + "T00:00:00.000Z");
};

/** "HH:MM:SS" 문자열 → Date 객체 */
export const parseTime = (timeString: string): Date => {
  const [hours, minutes, seconds] = timeString.split(":").map(Number);
  const date = new Date();
  date.setUTCHours(hours, minutes, seconds || 0, 0);
  return date;
};

/** Date → "YYYY-MM-DD" */
export const formatDate = (date: Date): string => {
  return date.toISOString().split("T")[0];
};

/** Date → "HH:MM:SS" */
export const formatTime = (date: Date): string => {
  const hours = date.getUTCHours().toString().padStart(2, "0");
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const seconds = date.getUTCSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

// ─── 날짜 범위 필터 ────────────────────────────────────────────────────────────

/** 연도 기준 Prisma date 필터 */
export const getYearFilter = (year?: string) => {
  if (!year) return {};
  const yearNum = parseInt(year, 10);
  return {
    date: {
      gte: new Date(`${yearNum}-01-01T00:00:00.000Z`),
      lte: new Date(`${yearNum}-12-31T00:00:00.000Z`),
    },
  };
};

/** 연도-월 기준 Prisma date 필터 */
export const getYearMonthFilter = (year: string, month: string) => {
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);
  const mm = monthNum.toString().padStart(2, "0");
  const lastDay = new Date(yearNum, monthNum, 0).getDate();
  return {
    date: {
      gte: new Date(`${yearNum}-${mm}-01T00:00:00.000Z`),
      lte: new Date(`${yearNum}-${mm}-${lastDay.toString().padStart(2, "0")}T00:00:00.000Z`),
    },
  };
};

/** year / month 쿼리 파라미터로부터 Prisma date 필터 생성. 유효하지 않은 월이면 null 반환 */
export const buildDateFilter = (
  year?: string,
  month?: string
): { date?: { gte: Date; lte: Date } } | null => {
  if (year && month && month !== "") {
    const monthStr = (month as string).padStart(2, "0");
    if (parseInt(monthStr, 10) < 1 || parseInt(monthStr, 10) > 12) return null;
    return getYearMonthFilter(year, monthStr);
  }
  if (year) return getYearFilter(year);
  return {};
};

/**
 * startDate/endDate(우선) 또는 year/month 로부터 Prisma date 필터 생성.
 * - startDate/endDate가 있으면 year/month는 무시
 * - 날짜 형식이 올바르지 않거나 월이 유효하지 않으면 null 반환
 */
export const buildReportDateFilter = (params: {
  year?: string;
  month?: string;
  startDate?: string;
  endDate?: string;
}): { date?: { gte?: Date; lte?: Date } } | null => {
  const { year, month, startDate, endDate } = params;
  if (startDate || endDate) {
    const gte = startDate ? new Date(startDate + "T00:00:00.000Z") : undefined;
    const lte = endDate ? new Date(endDate + "T00:00:00.000Z") : undefined;
    if ((gte && isNaN(gte.getTime())) || (lte && isNaN(lte.getTime()))) return null;
    const dateRange: { gte?: Date; lte?: Date } = {};
    if (gte) dateRange.gte = gte;
    if (lte) dateRange.lte = lte;
    return Object.keys(dateRange).length > 0 ? { date: dateRange } : {};
  }
  return buildDateFilter(year, month);
};

// ─── 장르 변환 ─────────────────────────────────────────────────────────────────

/** 한글 장르 문자열 → Prisma genre 필터. 유효하지 않은 장르면 null 반환 */
export const buildGenreFilter = (
  genre?: string
): { genre: Genre } | Record<string, never> | null => {
  if (!genre || genre === "") return {};
  const parsed = parseGenre(genre);
  if (parsed === null) return null;
  return { genre: parsed };
};

/** 한글 장르 문자열 → Genre enum */
export const parseGenre = (genre?: string): Genre | null => {
  if (genre === "연극") return Genre.THEATER;
  if (genre === "뮤지컬") return Genre.MUSICAL;
  return null;
};

/** Genre enum → 한글 문자열 */
export const formatGenre = (genre: Genre | null): string | null => {
  if (genre === Genre.THEATER) return "연극";
  if (genre === Genre.MUSICAL) return "뮤지컬";
  return null;
};

// ─── 배우 도메인 변환 ──────────────────────────────────────────────────────────

/** 한글 도메인 문자열 → ActorDomain enum. 없거나 빈 문자열이면 null 반환 */
export const parseActorDomain = (domain?: string): ActorDomain | null => {
  if (!domain) return null;
  const map: Record<string, ActorDomain> = {
    뮤지컬: ActorDomain.MUSICAL,
    연극: ActorDomain.THEATER,
    클래식: ActorDomain.CLASSIC,
    기타: ActorDomain.OTHER,
  };
  return map[domain] ?? null;
};

/** ActorDomain enum → 한글 문자열 */
export const formatActorDomain = (domain: ActorDomain | null | undefined): string | null => {
  if (!domain) return null;
  const map: Record<ActorDomain, string> = {
    [ActorDomain.MUSICAL]: "뮤지컬",
    [ActorDomain.THEATER]: "연극",
    [ActorDomain.CLASSIC]: "클래식",
    [ActorDomain.OTHER]: "기타",
  };
  return map[domain] ?? null;
};

// ─── 페이징 ────────────────────────────────────────────────────────────────────

export interface PaginationParams {
  pageNum: number;
  limitNum: number;
}

export interface PaginationValidationError {
  error: string;
  code: string;
}

/**
 * page / limit 쿼리 파라미터를 파싱하고 유효성을 검사합니다.
 * 유효하지 않으면 에러 객체를, 유효하면 파싱된 값을 반환합니다.
 */
export const parsePagination = (
  page: unknown,
  limit: unknown,
  defaultLimit = 50
): PaginationParams | PaginationValidationError => {
  const pageNum = parseInt((page as string) || "1", 10);
  const limitNum = parseInt((limit as string) || String(defaultLimit), 10);

  if (pageNum < 1) {
    return { error: "페이지 번호는 1 이상이어야 합니다.", code: "INVALID_PAGE" };
  }
  if (limitNum < 1 || limitNum > 100) {
    return {
      error: "페이지당 항목 수는 1 이상 100 이하여야 합니다.",
      code: "INVALID_LIMIT",
    };
  }

  return { pageNum, limitNum };
};

export const isPaginationError = (
  result: PaginationParams | PaginationValidationError
): result is PaginationValidationError => "error" in result;
