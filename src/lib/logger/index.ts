import { captureError } from "./error-sink";

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };
  // Structured JSON output — never log secrets or PII
  if (level === "error") {
    console.error(JSON.stringify(entry));
    // And a durable, grouped copy in `error_events` (062), because the console
    // line above reaches a log that alerts on nothing. Fire and forget; it
    // redacts, never throws, and never calls back into this logger.
    captureError({ level: "error", message, meta });
  } else if (level === "warn") {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) =>
    log("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) =>
    log("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) =>
    log("error", message, meta),
};
