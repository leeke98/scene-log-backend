import express, { Request, Response } from "express";
import dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";
import { prisma } from "./lib/prisma";
import { swaggerSpec } from "./config/swagger";
import userRoutes from "./routes/users";
import authRoutes from "./routes/auth";
import ticketRoutes from "./routes/tickets";
import reportRoutes from "./routes/reports/index";
import kopisRoutes from "./routes/kopis";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS 설정
app.use((req: Request, res: Response, next: () => void) => {
  const origin = req.headers.origin;
  // 모든 origin 허용 (프로덕션에서는 특정 도메인만 허용하도록 수정 권장)
  res.header("Access-Control-Allow-Origin", origin || "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger JSON 엔드포인트 - 동적 서버 URL 주입
app.get("/api-docs.json", (req: Request, res: Response) => {
  // Render.com 등 프록시 환경에서 올바른 프로토콜 감지
  const protocol = req.get("x-forwarded-proto") || req.protocol || "https";
  const host =
    req.get("host") || req.get("x-forwarded-host") || "localhost:3001";
  const baseUrl = `${protocol}://${host}`;

  const specWithServer = {
    ...swaggerSpec,
    servers: [
      {
        url: baseUrl,
        description:
          process.env.NODE_ENV === "production" ? "프로덕션 서버" : "개발 서버",
      },
    ],
  };

  res.json(specWithServer);
});

// Swagger UI - 동적 서버 URL 사용
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(undefined, {
    swaggerOptions: {
      url: "/api-docs.json", // 동적 서버 URL이 포함된 JSON 사용
      persistAuthorization: true,
    },
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Scene Log API Documentation",
  })
);

// Routes
app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Scene Log Backend API is running!" });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/kopis", kopisRoutes);

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(async () => {
    console.log("HTTP server closed");
    await prisma.$disconnect();
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log("SIGINT signal received: closing HTTP server");
  server.close(async () => {
    console.log("HTTP server closed");
    await prisma.$disconnect();
    process.exit(0);
  });
});
