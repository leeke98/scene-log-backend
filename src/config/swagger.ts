import swaggerJsdoc from "swagger-jsdoc";
import { SwaggerDefinition } from "swagger-jsdoc";

const swaggerDefinition: SwaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Scene Log Backend API",
    version: "1.0.0",
    description: "Scene Log 백엔드 API 문서",
    contact: {
      name: "API Support",
    },
  },
  servers: [
    {
      url: `http://localhost:${process.env.PORT || 3001}`,
      description: "개발 서버",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT 토큰을 입력하세요. (Bearer 제외)",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "string",
            description: "에러 메시지",
          },
          code: {
            type: "string",
            description: "에러 코드",
          },
        },
      },
      User: {
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
          },
          username: {
            type: "string",
          },
          nickname: {
            type: "string",
          },
          createdAt: {
            type: "string",
            format: "date-time",
          },
        },
      },
      Ticket: {
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
          },
          date: {
            type: "string",
            format: "date",
          },
          time: {
            type: "string",
            format: "time",
          },
          performanceName: {
            type: "string",
          },
          genre: {
            type: "string",
            enum: ["연극", "뮤지컬"],
          },
          isChild: {
            type: "boolean",
          },
          theater: {
            type: "string",
          },
          seat: {
            type: "string",
            nullable: true,
          },
          ticketPrice: {
            type: "integer",
          },
          companion: {
            type: "string",
            nullable: true,
          },
          mdPrice: {
            type: "integer",
          },
          rating: {
            type: "integer",
            minimum: 0,
            maximum: 5,
          },
          review: {
            type: "string",
            nullable: true,
          },
          posterUrl: {
            type: "string",
            nullable: true,
          },
          casting: {
            type: "array",
            items: {
              type: "string",
            },
          },
          createdAt: {
            type: "string",
            format: "date-time",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
          },
        },
      },
    },
  },
  tags: [
    {
      name: "Auth",
      description: "인증 관련 API",
    },
    {
      name: "Users",
      description: "사용자 관련 API",
    },
    {
      name: "Tickets",
      description: "티켓 관련 API",
    },
    {
      name: "Reports",
      description: "리포트 관련 API",
    },
  ],
};

const options = {
  definition: swaggerDefinition,
  apis: ["./src/routes/**/*.ts"], // Swagger 주석이 있는 파일 경로
};

export const swaggerSpec = swaggerJsdoc(options);
