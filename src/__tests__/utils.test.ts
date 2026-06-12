import { describe, it, expect } from "vitest";
import { Genre, ActorDomain } from "@prisma/client";
import {
  parseDate,
  parseTime,
  formatDate,
  formatTime,
  getYearFilter,
  getYearMonthFilter,
  buildDateFilter,
  buildReportDateFilter,
  buildGenreFilter,
  parseGenre,
  formatGenre,
  parseActorDomain,
  formatActorDomain,
  parsePagination,
  isPaginationError,
} from "../lib/utils";

// ─── 날짜 / 시간 변환 ──────────────────────────────────────────────────────────

describe("parseDate", () => {
  it("YYYY-MM-DD를 UTC 자정 Date로 변환한다", () => {
    expect(parseDate("2024-03-15").toISOString()).toBe("2024-03-15T00:00:00.000Z");
  });
});

describe("parseTime / formatTime", () => {
  it("HH:MM:SS를 UTC 시각으로 설정한다", () => {
    expect(formatTime(parseTime("19:30:45"))).toBe("19:30:45");
  });

  it("초가 생략되면 00으로 채운다", () => {
    const date = parseTime("09:05");
    expect(date.getUTCHours()).toBe(9);
    expect(date.getUTCMinutes()).toBe(5);
    expect(date.getUTCSeconds()).toBe(0);
  });

  it("formatTime은 한 자리 시/분/초를 0으로 패딩한다", () => {
    const date = new Date();
    date.setUTCHours(1, 2, 3, 0);
    expect(formatTime(date)).toBe("01:02:03");
  });
});

describe("formatDate", () => {
  it("Date를 YYYY-MM-DD로 변환한다", () => {
    expect(formatDate(new Date("2024-03-15T12:34:56.000Z"))).toBe("2024-03-15");
  });
});

// ─── 날짜 범위 필터 ────────────────────────────────────────────────────────────

describe("getYearFilter", () => {
  it("연도가 없으면 빈 객체를 반환한다", () => {
    expect(getYearFilter()).toEqual({});
  });

  it("연도의 1월 1일 ~ 12월 31일 범위를 만든다", () => {
    const filter = getYearFilter("2024");
    expect(filter.date?.gte.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(filter.date?.lte.toISOString()).toBe("2024-12-31T00:00:00.000Z");
  });
});

describe("getYearMonthFilter", () => {
  it("일반 달의 말일을 정확히 계산한다 (4월=30일)", () => {
    const filter = getYearMonthFilter("2024", "04");
    expect(filter.date.gte.toISOString()).toBe("2024-04-01T00:00:00.000Z");
    expect(filter.date.lte.toISOString()).toBe("2024-04-30T00:00:00.000Z");
  });

  it("윤년 2월은 29일까지 포함한다", () => {
    const filter = getYearMonthFilter("2024", "02");
    expect(filter.date.lte.toISOString()).toBe("2024-02-29T00:00:00.000Z");
  });

  it("평년 2월은 28일까지 포함한다", () => {
    const filter = getYearMonthFilter("2023", "02");
    expect(filter.date.lte.toISOString()).toBe("2023-02-28T00:00:00.000Z");
  });
});

describe("buildDateFilter", () => {
  it("연도+월이 모두 있으면 월 범위를 만든다", () => {
    const filter = buildDateFilter("2024", "03");
    expect(filter).not.toBeNull();
    expect(filter!.date?.gte.toISOString()).toBe("2024-03-01T00:00:00.000Z");
    expect(filter!.date?.lte.toISOString()).toBe("2024-03-31T00:00:00.000Z");
  });

  it("월이 패딩되지 않아도 처리한다 (3 → 03)", () => {
    const filter = buildDateFilter("2024", "3");
    expect(filter!.date?.gte.toISOString()).toBe("2024-03-01T00:00:00.000Z");
  });

  it("월이 1~12 범위를 벗어나면 null을 반환한다", () => {
    expect(buildDateFilter("2024", "0")).toBeNull();
    expect(buildDateFilter("2024", "13")).toBeNull();
  });

  it("연도만 있으면 연 범위를 만든다", () => {
    const filter = buildDateFilter("2024");
    expect(filter!.date?.gte.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(filter!.date?.lte.toISOString()).toBe("2024-12-31T00:00:00.000Z");
  });

  it("아무 인자도 없으면 빈 객체를 반환한다", () => {
    expect(buildDateFilter()).toEqual({});
  });
});

describe("buildReportDateFilter", () => {
  it("startDate/endDate가 있으면 우선 적용하고 year/month는 무시한다", () => {
    const filter = buildReportDateFilter({
      year: "2020",
      month: "06",
      startDate: "2024-01-15",
      endDate: "2024-02-20",
    });
    expect(filter!.date?.gte?.toISOString()).toBe("2024-01-15T00:00:00.000Z");
    expect(filter!.date?.lte?.toISOString()).toBe("2024-02-20T00:00:00.000Z");
  });

  it("startDate만 있으면 gte만 설정한다", () => {
    const filter = buildReportDateFilter({ startDate: "2024-01-15" });
    expect(filter!.date?.gte?.toISOString()).toBe("2024-01-15T00:00:00.000Z");
    expect(filter!.date?.lte).toBeUndefined();
  });

  it("날짜 형식이 올바르지 않으면 null을 반환한다", () => {
    expect(buildReportDateFilter({ startDate: "not-a-date" })).toBeNull();
  });

  it("startDate/endDate가 없으면 year/month로 폴백한다", () => {
    const filter = buildReportDateFilter({ year: "2024", month: "03" });
    expect(filter!.date?.gte?.toISOString()).toBe("2024-03-01T00:00:00.000Z");
  });
});

// ─── 장르 변환 ─────────────────────────────────────────────────────────────────

describe("parseGenre / formatGenre", () => {
  it("한글 장르를 enum으로 변환한다", () => {
    expect(parseGenre("연극")).toBe(Genre.THEATER);
    expect(parseGenre("뮤지컬")).toBe(Genre.MUSICAL);
  });

  it("알 수 없는 장르는 null을 반환한다", () => {
    expect(parseGenre("오페라")).toBeNull();
    expect(parseGenre()).toBeNull();
  });

  it("enum을 한글로 역변환한다 (round-trip)", () => {
    expect(formatGenre(Genre.THEATER)).toBe("연극");
    expect(formatGenre(Genre.MUSICAL)).toBe("뮤지컬");
    expect(formatGenre(null)).toBeNull();
  });
});

describe("buildGenreFilter", () => {
  it("빈 값이면 빈 객체를 반환한다 (필터 없음)", () => {
    expect(buildGenreFilter()).toEqual({});
    expect(buildGenreFilter("")).toEqual({});
  });

  it("유효한 장르면 genre 필터를 반환한다", () => {
    expect(buildGenreFilter("뮤지컬")).toEqual({ genre: Genre.MUSICAL });
  });

  it("유효하지 않은 장르면 null을 반환한다", () => {
    expect(buildGenreFilter("오페라")).toBeNull();
  });
});

// ─── 배우 도메인 변환 ──────────────────────────────────────────────────────────

describe("parseActorDomain / formatActorDomain", () => {
  it("한글 도메인을 enum으로 변환한다", () => {
    expect(parseActorDomain("뮤지컬")).toBe(ActorDomain.MUSICAL);
    expect(parseActorDomain("연극")).toBe(ActorDomain.THEATER);
    expect(parseActorDomain("클래식")).toBe(ActorDomain.CLASSIC);
    expect(parseActorDomain("기타")).toBe(ActorDomain.OTHER);
  });

  it("없거나 알 수 없는 도메인은 null을 반환한다", () => {
    expect(parseActorDomain()).toBeNull();
    expect(parseActorDomain("")).toBeNull();
    expect(parseActorDomain("발레")).toBeNull();
  });

  it("enum을 한글로 역변환한다", () => {
    expect(formatActorDomain(ActorDomain.MUSICAL)).toBe("뮤지컬");
    expect(formatActorDomain(null)).toBeNull();
    expect(formatActorDomain(undefined)).toBeNull();
  });
});

// ─── 페이징 ────────────────────────────────────────────────────────────────────

describe("parsePagination", () => {
  it("값이 없으면 기본값(page 1, limit 50)을 사용한다", () => {
    const result = parsePagination(undefined, undefined);
    expect(isPaginationError(result)).toBe(false);
    expect(result).toEqual({ pageNum: 1, limitNum: 50 });
  });

  it("defaultLimit 인자를 존중한다", () => {
    const result = parsePagination(undefined, undefined, 20);
    expect(result).toEqual({ pageNum: 1, limitNum: 20 });
  });

  it("문자열 숫자를 파싱한다", () => {
    expect(parsePagination("2", "30")).toEqual({ pageNum: 2, limitNum: 30 });
  });

  it("페이지가 1 미만이면 INVALID_PAGE 에러를 반환한다", () => {
    const result = parsePagination("0", "50");
    expect(isPaginationError(result)).toBe(true);
    if (isPaginationError(result)) expect(result.code).toBe("INVALID_PAGE");
  });

  it("limit 경계값(1, 100)은 허용한다", () => {
    expect(isPaginationError(parsePagination("1", "1"))).toBe(false);
    expect(isPaginationError(parsePagination("1", "100"))).toBe(false);
  });

  it("limit이 0이거나 100을 초과하면 INVALID_LIMIT 에러를 반환한다", () => {
    const low = parsePagination("1", "0");
    const high = parsePagination("1", "101");
    expect(isPaginationError(low)).toBe(true);
    expect(isPaginationError(high)).toBe(true);
    if (isPaginationError(high)) expect(high.code).toBe("INVALID_LIMIT");
  });
});
