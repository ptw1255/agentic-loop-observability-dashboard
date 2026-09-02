import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface StructuredLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  event: string;
  requestId?: string;
  data: Record<string, unknown>;
}

export class StructuredLogger {
  constructor(private readonly logFilePath: string) {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
  }

  createRequestId(): string {
    return crypto.randomUUID();
  }

  info(event: string, data: Record<string, unknown>, requestId?: string): void {
    this.write({ timestamp: new Date().toISOString(), level: "info", event, requestId, data });
  }

  warn(event: string, data: Record<string, unknown>, requestId?: string): void {
    this.write({ timestamp: new Date().toISOString(), level: "warn", event, requestId, data });
  }

  error(event: string, data: Record<string, unknown>, requestId?: string): void {
    this.write({ timestamp: new Date().toISOString(), level: "error", event, requestId, data });
  }

  readRecent(limit: number): StructuredLogEntry[] {
    if (!fs.existsSync(this.logFilePath)) {
      return [];
    }

    const lines = fs
      .readFileSync(this.logFilePath, "utf8")
      .split("\n")
      .filter(Boolean)
      .slice(-limit);

    return lines.flatMap((line) => {
      try {
        return [JSON.parse(line) as StructuredLogEntry];
      } catch {
        return [];
      }
    });
  }

  get logPath(): string {
    return this.logFilePath;
  }

  private write(entry: StructuredLogEntry): void {
    fs.appendFileSync(this.logFilePath, `${JSON.stringify(entry)}\n`, "utf8");
  }
}
