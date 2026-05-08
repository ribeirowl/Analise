import { config } from "./config";

type LogLevel = "debug" | "info" | "warn" | "error";

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const colors: Record<LogLevel, string> = {
  debug: "\x1b[36m",
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};
const reset = "\x1b[0m";

function log(level: LogLevel, message: string, meta?: unknown): void {
  if (levels[level] < levels[config.LOG_LEVEL as LogLevel]) return;
  const ts = new Date().toISOString();
  const color = colors[level];
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`${color}[${level.toUpperCase()}]${reset} ${ts} ${message}${metaStr}`);
}

export const logger = {
  debug: (msg: string, meta?: unknown) => log("debug", msg, meta),
  info: (msg: string, meta?: unknown) => log("info", msg, meta),
  warn: (msg: string, meta?: unknown) => log("warn", msg, meta),
  error: (msg: string, meta?: unknown) => log("error", msg, meta),
};
