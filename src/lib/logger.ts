import log4js from "log4js";

const level = process.env.LOG_LEVEL ?? "info";
const logDir = process.env.LOG_DIR ?? "/app/logs"; // в docker можно примонтировать volume

log4js.configure({
  appenders: {
    out: { type: "stdout" },

    // если хочешь файлы — dateFile удобнее: ротация по дню
    // (если не надо — можно удалить appender file и убрать из categories)
    file: {
      type: "dateFile",
      filename: `${logDir}/app.log`,
      pattern: "yyyy-MM-dd",
      compress: true,
      daysToKeep: 14,
      keepFileExt: true,
    },
  },
  categories: {
    default: { appenders: ["out"], level },
    api: { appenders: ["out"], level },
    scheduler: { appenders: ["out"], level },
    fetch: { appenders: ["out"], level },
    process: { appenders: ["out"], level },
    warpath: { appenders: ["out"], level },

    // если хочешь отдельно в файл:
    // default: { appenders: ["out", "file"], level },
    // api: { appenders: ["out", "file"], level }, ...
  },
});

export function getLogger(category: string) {
  return log4js.getLogger(category); // категории — базовая концепция log4js :contentReference[oaicite:1]{index=1}
}

export { log4js };
