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
      url: "/", // 상대 경로 사용 (요청 호스트 기반)
      description:
        process.env.NODE_ENV === "production" ? "프로덕션 서버" : "개발 서버",
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
      KopisBoxofficeItem: {
        type: "object",
        properties: {
          mt20id: {
            type: "string",
            description: "공연 ID",
          },
          poster: {
            type: "string",
            description: "포스터 URL",
          },
          genrenm: {
            type: "string",
            description: "장르명",
          },
        },
      },
      KopisPerformance: {
        type: "object",
        properties: {
          mt20id: {
            type: "string",
            description: "공연 ID",
          },
          prfnm: {
            type: "string",
            description: "공연명",
          },
          prfpdfrom: {
            type: "string",
            description: "공연 시작일",
          },
          prfpdto: {
            type: "string",
            description: "공연 종료일",
          },
          fcltynm: {
            type: "string",
            description: "시설명(극장)",
          },
          poster: {
            type: "string",
            description: "포스터 URL",
          },
          area: {
            type: "string",
            description: "지역",
          },
          genrenm: {
            type: "string",
            description: "장르명",
          },
          openrun: {
            type: "string",
            description: "오픈런 여부",
          },
          prfstate: {
            type: "string",
            description: "공연 상태",
          },
        },
      },
      KopisPerformanceDetail: {
        allOf: [
          { $ref: "#/components/schemas/KopisPerformance" },
          {
            type: "object",
            properties: {
              prfcast: {
                type: "string",
                description: "캐스팅",
              },
              prfcrew: {
                type: "string",
                description: "제작진",
              },
              prfruntime: {
                type: "string",
                description: "공연 시간",
              },
              prfage: {
                type: "string",
                description: "관람 연령",
              },
              pcseguidance: {
                type: "string",
                description: "가격 안내",
              },
              dtguidance: {
                type: "string",
                description: "시간 안내",
              },
              mt10id: {
                type: "string",
                description: "시설 ID",
              },
            },
          },
        ],
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
    {
      name: "KOPIS",
      description: "KOPIS Open API 프록시",
    },
  ],
};

const options = {
  definition: swaggerDefinition,
  apis: ["./src/routes/**/*.ts"], // Swagger 주석이 있는 파일 경로
};

export const swaggerSpec = swaggerJsdoc(options);
