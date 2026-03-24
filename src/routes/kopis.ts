import { Router, Request, Response, NextFunction } from "express";
import { XMLParser } from "fast-xml-parser";

const router = Router();

// XML 파서 설정
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

/**
 * KOPIS 서비스 키 존재 여부 확인 미들웨어
 */
const requireServiceKey = (_req: Request, res: Response, next: NextFunction): void => {
  if (!process.env.KOPIS_SERVICE_KEY) {
    res.status(500).json({
      error: "KOPIS 서비스 키가 설정되지 않았습니다.",
      code: "KOPIS_SERVICE_KEY_MISSING",
    });
    return;
  }
  next();
};

router.use(requireServiceKey);

/**
 * 날짜를 YYYYMMDD 형식으로 변환
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * @openapi
 * /api/kopis/boxoffice:
 *   get:
 *     summary: KOPIS 박스오피스 조회
 *     description: KOPIS Open API를 통해 박스오피스 정보를 조회합니다.
 *     tags: [KOPIS]
 *     parameters:
 *       - in: query
 *         name: genre
 *         schema:
 *           type: string
 *           enum: [연극, 뮤지컬]
 *         description: "장르 (연극 또는 뮤지컬)"
 *     responses:
 *       200:
 *         description: 박스오피스 정보
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/KopisBoxofficeItem'
 *       400:
 *         description: 잘못된 요청
 *       500:
 *         description: 서버 오류
 */
router.get("/boxoffice", async (req: Request, res: Response): Promise<void> => {
  try {
    const { genre } = req.query;
    const serviceKey = process.env.KOPIS_SERVICE_KEY!;

    if (!genre || (genre !== "연극" && genre !== "뮤지컬")) {
      res.status(400).json({
        error: "genre 파라미터는 '연극' 또는 '뮤지컬'이어야 합니다.",
        code: "INVALID_GENRE",
      });
      return;
    }

    // 장르 코드 변환
    const catecode = genre === "연극" ? "AAAA" : "GGGA";

    // 날짜 계산 (오늘부터 일주일 전)
    const today = new Date();
    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(today.getDate() - 7);

    const stdate = formatDate(oneWeekAgo);
    const eddate = formatDate(today);

    // KOPIS API 호출
    const url = `http://www.kopis.or.kr/openApi/restful/boxoffice?service=${serviceKey}&stdate=${stdate}&eddate=${eddate}&catecode=${catecode}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`KOPIS API 호출 실패: ${response.status}`);
    }

    const xmlText = await response.text();
    const jsonData = xmlParser.parse(xmlText);

    // XML 구조 파싱
    const boxofs = jsonData.boxofs;
    const boxofArray = Array.isArray(boxofs?.boxof)
      ? boxofs.boxof
      : boxofs?.boxof
      ? [boxofs.boxof]
      : [];

    // 응답 형식 변환
    const performances = boxofArray.map((item: any) => {
      return {
        mt20id: item.mt20id || "",
        prfnm: item.prfnm || "",
        prfplcnm: item.prfplcnm || "",
        poster: item.poster || "",
        genrenm: item.cate || "",
      };
    });

    res.json({ data: performances });
  } catch (error) {
    console.error("KOPIS 박스오피스 조회 오류:", error);
    res.status(500).json({
      error: "박스오피스 정보를 가져오는 중 오류가 발생했습니다.",
      code: "GET_BOXOFFICE_ERROR",
    });
  }
});

/**
 * @openapi
 * /api/kopis/performances:
 *   get:
 *     summary: KOPIS 공연 검색
 *     description: KOPIS Open API를 통해 공연을 검색합니다.
 *     tags: [KOPIS]
 *     parameters:
 *       - in: query
 *         name: stdate
 *         schema:
 *           type: string
 *           format: date
 *         description: "시작일 (YYYYMMDD 형식, 예: 20251128)"
 *       - in: query
 *         name: eddate
 *         schema:
 *           type: string
 *           format: date
 *         description: "종료일 (YYYYMMDD 형식, 예: 20251128)"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: "페이지 번호 (기본값: 1)"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: "페이지당 결과 수 (기본값: 20)"
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: "작품명 검색어"
 *       - in: query
 *         name: genre
 *         schema:
 *           type: string
 *           enum: [연극, 뮤지컬]
 *         description: "장르 (연극 또는 뮤지컬)"
 *       - in: query
 *         name: isChild
 *         schema:
 *           type: boolean
 *           default: false
 *         description: "아동 공연 여부"
 *     responses:
 *       200:
 *         description: 공연 검색 결과
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/KopisPerformance'
 *       400:
 *         description: 잘못된 요청
 *       500:
 *         description: 서버 오류
 */
router.get(
  "/performances",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { stdate, eddate, page, limit, search, genre, isChild } = req.query;
      const serviceKey = process.env.KOPIS_SERVICE_KEY!;

      // 페이징 파라미터
      const pageNum = parseInt((page as string) || "1", 10);
      const limitNum = parseInt((limit as string) || "20", 10);

      if (pageNum < 1) {
        res.status(400).json({
          error: "페이지 번호는 1 이상이어야 합니다.",
          code: "INVALID_PAGE",
        });
        return;
      }

      if (limitNum < 1 || limitNum > 100) {
        res.status(400).json({
          error: "페이지당 결과 수는 1 이상 100 이하여야 합니다.",
          code: "INVALID_LIMIT",
        });
        return;
      }

      // URL 파라미터 구성
      const params = new URLSearchParams();
      params.append("service", serviceKey);
      if (stdate) params.append("stdate", stdate as string);
      if (eddate) params.append("eddate", eddate as string);
      params.append("cpage", pageNum.toString());
      params.append("rows", limitNum.toString());
      if (search) params.append("shprfnm", search as string);
      if (genre) {
        const catecode = genre === "연극" ? "AAAA" : "GGGA";
        params.append("shcate", catecode);
      }
      params.append("kidstate", isChild === "true" ? "Y" : "N");

      // KOPIS API 호출
      const url = `http://www.kopis.or.kr/openApi/restful/pblprfr?${params.toString()}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`KOPIS API 호출 실패: ${response.status}`);
      }

      const xmlText = await response.text();
      const jsonData = xmlParser.parse(xmlText);

      // XML 구조 파싱
      const dbs = jsonData.dbs;
      const dbArray = Array.isArray(dbs?.db) ? dbs.db : dbs?.db ? [dbs.db] : [];

      // 에러 응답 확인
      if (
        dbArray.length > 0 &&
        dbArray[0].returncode &&
        dbArray[0].returncode !== "00"
      ) {
        res.status(400).json({
          error: dbArray[0].errmsg || "KOPIS API 오류",
          code: "KOPIS_API_ERROR",
          returncode: dbArray[0].returncode,
        });
        return;
      }

      // 응답 형식 변환
      const performances = dbArray
        .filter((item: any) => item.mt20id) // 유효한 공연만 필터링
        .map((item: any) => {
          return {
            mt20id: item.mt20id || "",
            prfnm: item.prfnm || "",
            prfpdfrom: item.prfpdfrom || "",
            prfpdto: item.prfpdto || "",
            fcltynm: item.fcltynm || "",
            poster: item.poster || "",
            area: item.area || "",
            genrenm: item.genrenm || "",
            openrun: item.openrun || "",
            prfstate: item.prfstate || "",
          };
        });

      res.json(performances);
    } catch (error) {
      console.error("KOPIS 공연 검색 오류:", error);
      res.status(500).json({
        error: "공연 검색 중 오류가 발생했습니다.",
        code: "SEARCH_PERFORMANCES_ERROR",
      });
    }
  }
);

/**
 * @openapi
 * /api/kopis/performances/{mt20id}:
 *   get:
 *     summary: KOPIS 공연 상세 정보 조회
 *     description: KOPIS Open API를 통해 공연 상세 정보를 조회합니다.
 *     tags: [KOPIS]
 *     parameters:
 *       - in: path
 *         name: mt20id
 *         required: true
 *         schema:
 *           type: string
 *         description: "공연 ID"
 *     responses:
 *       200:
 *         description: 공연 상세 정보
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KopisPerformanceDetail'
 *       404:
 *         description: 공연을 찾을 수 없습니다
 *       500:
 *         description: 서버 오류
 */
router.get(
  "/performances/:mt20id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { mt20id } = req.params;
      const serviceKey = process.env.KOPIS_SERVICE_KEY!;

      if (!mt20id) {
        res.status(400).json({
          error: "공연 ID가 필요합니다.",
          code: "MISSING_MT20ID",
        });
        return;
      }

      // KOPIS API 호출
      const url = `http://www.kopis.or.kr/openApi/restful/pblprfr/${mt20id}?service=${serviceKey}`;

      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) {
          res.status(404).json({
            error: "공연을 찾을 수 없습니다.",
            code: "PERFORMANCE_NOT_FOUND",
          });
          return;
        }
        throw new Error(`KOPIS API 호출 실패: ${response.status}`);
      }

      const xmlText = await response.text();
      const jsonData = xmlParser.parse(xmlText);

      // XML 구조 파싱 (KOPIS API는 db 태그 안에 정보가 있음)
      const db = jsonData.dbs.db;
      if (!db) {
        res.status(404).json({
          error: "공연 정보를 찾을 수 없습니다.",
          code: "PERFORMANCE_NOT_FOUND",
        });
        return;
      }

      // 응답 형식 변환 (모든 필드를 포함)
      const performance: Record<string, string | undefined> = {
        mt20id: db.mt20id || mt20id,
        prfnm: db.prfnm || "",
        prfpdfrom: db.prfpdfrom || "",
        prfpdto: db.prfpdto || "",
        fcltynm: db.fcltynm || "",
        poster: db.poster || "",
        area: db.area || "",
        genrenm: db.genrenm || "",
        openrun: db.openrun || "",
        prfstate: db.prfstate || "",
        prfcast: db.prfcast || "",
        prfcrew: db.prfcrew || "",
        prfruntime: db.prfruntime || "",
        prfage: db.prfage || "",
        pcseguidance: db.pcseguidance || "",
        dtguidance: db.dtguidance || "",
        mt10id: db.mt10id || "",
      };

      // XML에 있는 모든 추가 필드 포함
      Object.keys(db).forEach((key) => {
        if (!performance[key]) {
          performance[key] = db[key];
        }
      });

      res.json(performance);
    } catch (error) {
      console.error("KOPIS 공연 상세 정보 조회 오류:", error);
      res.status(500).json({
        error: "공연 상세 정보를 가져오는 중 오류가 발생했습니다.",
        code: "GET_PERFORMANCE_DETAIL_ERROR",
      });
    }
  }
);

export default router;
