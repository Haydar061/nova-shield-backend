import winston from "winston";

const transports: winston.transport[] = [new winston.transports.Console()];

// Vercel serverless'ta filesystem read-only — sadece console kullan
if (!process.env.VERCEL) {
  transports.push(
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/app.log" })
  );
}

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const extras = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
      return `${timestamp} [${level}] ${message}${extras}`;
    })
  ),
  transports,
});
