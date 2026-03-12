const dayIntDescription = "Дата в формате YYYYMMDD, например 20260124";

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Warpath Stats API",
    version: "0.1.0",
    description: "API для управления задачами сбора, трекингом альянсов и датасетами игроков.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "Health" },
    { name: "Jobs" },
    { name: "Alliances" },
    { name: "Players" },
  ],
  components: {
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
        required: ["error"],
      },
      TrackedAlliance: {
        type: "object",
        properties: {
          id: { type: "string", description: "BigInt в виде строки" },
          wid: { type: "integer" },
          gid: { type: "integer" },
          name: { type: "string", nullable: true },
          enabled: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "wid", "gid", "enabled", "createdAt"],
      },
      JobIdResponse: {
        type: "object",
        properties: {
          jobId: { oneOf: [{ type: "string" }, { type: "number" }, { type: "null" }] },
        },
        required: ["jobId"],
      },
      PlayerDatasetPoint: {
        type: "object",
        properties: {
          day: { type: "integer", description: dayIntDescription },
          gid: { type: "integer", nullable: true },
          gnick: { type: "string", nullable: true },
          nick: { type: "string", nullable: true },
          lv: { type: "integer", nullable: true },
          power: { type: "string", nullable: true },
          maxpower: { type: "string", nullable: true },
          sumkill: { type: "string", nullable: true },
          die: { type: "string", nullable: true },
          score: { type: "string", nullable: true },
          caiji: { type: "string", nullable: true },
          allianceTechContribution: { type: "string", nullable: true },
          allianceHelp: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time", nullable: true },
        },
        required: ["day"],
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Проверка доступности API",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { ok: { type: "boolean", example: true } },
                  required: ["ok"],
                },
              },
            },
          },
        },
      },
    },
    "/jobs/fetch": {
      post: {
        tags: ["Jobs"],
        summary: "Поставить задачу FETCH_GUILD_DETAIL",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  wid: { type: "integer" },
                  gid: { type: "integer" },
                  page: { type: "integer", default: 1 },
                  perPage: { type: "integer", default: 50 },
                },
                required: ["wid", "gid"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Job поставлен",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobIdResponse" },
              },
            },
          },
          "500": {
            description: "Ошибка",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/jobs/server-scan": {
      post: {
        tags: ["Jobs"],
        summary: "Поставить задачу FETCH_SERVER_RANK_DAY для одного дня",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  wid: { type: "integer" },
                  dayInt: { type: "integer", description: dayIntDescription },
                  page: { type: "integer", default: 1 },
                  perPage: { type: "integer", default: 3000 },
                },
                required: ["wid", "dayInt"],
              },
            },
          },
        },
        responses: {
          "202": {
            description: "Запрос принят",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    requested: { type: "object" },
                    jobId: { oneOf: [{ type: "string" }, { type: "number" }, { type: "null" }] },
                    note: { type: "string" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Ошибка валидации",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/jobs/server-backfill": {
      post: {
        tags: ["Jobs"],
        summary: "Поставить задачи FETCH_SERVER_RANK_DAY для диапазона дней",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  wid: { type: "integer" },
                  fromDayInt: { type: "integer", description: dayIntDescription },
                  toDayInt: { type: "integer", description: dayIntDescription },
                  page: { type: "integer", default: 1 },
                  perPage: { type: "integer", default: 3000 },
                },
                required: ["wid", "fromDayInt", "toDayInt"],
              },
            },
          },
        },
        responses: {
          "202": {
            description: "Запрос принят",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    requested: { type: "object" },
                    requestedJobs: { type: "integer" },
                    note: { type: "string" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Ошибка валидации",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/jobs/sync-latest": {
      post: {
        tags: ["Jobs"],
        summary: "Ручной триггер scheduler sync",
        responses: {
          "202": {
            description: "Запрос принят",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    schedulerJobId: { oneOf: [{ type: "string" }, { type: "number" }, { type: "null" }] },
                  },
                  required: ["ok", "schedulerJobId"],
                },
              },
            },
          },
        },
      },
    },
    "/alliances": {
      get: {
        tags: ["Alliances"],
        summary: "Список tracked alliances",
        responses: {
          "200": {
            description: "Список",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/TrackedAlliance" },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Alliances"],
        summary: "Добавить alliance в tracking и сразу поставить первый fetch",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  wid: { type: "integer" },
                  gid: { type: "integer" },
                },
                required: ["wid", "gid"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Создано",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    alliance: { $ref: "#/components/schemas/TrackedAlliance" },
                    firstFetchJobId: { oneOf: [{ type: "string" }, { type: "number" }, { type: "null" }] },
                  },
                  required: ["alliance", "firstFetchJobId"],
                },
              },
            },
          },
          "400": {
            description: "Ошибка валидации",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/alliances/{wid}/{gid}": {
      get: {
        tags: ["Alliances"],
        summary: "Получить tracked alliance",
        parameters: [
          { name: "wid", in: "path", required: true, schema: { type: "integer" } },
          { name: "gid", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrackedAlliance" },
              },
            },
          },
          "404": {
            description: "Не найдено",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Alliances"],
        summary: "Удалить tracked alliance",
        parameters: [
          { name: "wid", in: "path", required: true, schema: { type: "integer" } },
          { name: "gid", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: {
          "200": {
            description: "Удалено",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { ok: { type: "boolean" } },
                  required: ["ok"],
                },
              },
            },
          },
        },
      },
    },
    "/players/{wid}/{pid}/dataset": {
      get: {
        tags: ["Players"],
        summary: "Получить датасет игрока за диапазон дней",
        parameters: [
          { name: "wid", in: "path", required: true, schema: { type: "integer" } },
          { name: "pid", in: "path", required: true, schema: { type: "integer" } },
          {
            name: "from",
            in: "query",
            required: true,
            schema: { type: "integer" },
            description: dayIntDescription,
          },
          {
            name: "to",
            in: "query",
            required: true,
            schema: { type: "integer" },
            description: dayIntDescription,
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    wid: { type: "integer" },
                    pid: { type: "integer" },
                    fromDayInt: { type: "integer" },
                    toDayInt: { type: "integer" },
                    points: { type: "integer" },
                    series: {
                      type: "array",
                      items: { $ref: "#/components/schemas/PlayerDatasetPoint" },
                    },
                  },
                  required: ["wid", "pid", "fromDayInt", "toDayInt", "points", "series"],
                },
              },
            },
          },
          "400": {
            description: "Ошибка валидации",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
  },
} as const;
