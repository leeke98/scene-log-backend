import { Router } from "express";
import overallRoutes from "./overall";
import actorsRoutes from "./actors";
import performancesRoutes from "./performances";

const router = Router();

// 전체 통계 라우트
router.use(overallRoutes);

// 배우 통계 라우트
router.use(actorsRoutes);

// 공연 통계 라우트
router.use(performancesRoutes);

export default router;
