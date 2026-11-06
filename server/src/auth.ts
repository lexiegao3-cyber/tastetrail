import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import { HttpError } from "./errors.js";

export interface AuthConfig {
  secret: Uint8Array;
  ttlSeconds: number;
}

export function authConfigFromEnv(env = process.env): AuthConfig {
  const raw = env.TASTETRAIL_JWT_SECRET;
  if (!raw && env.NODE_ENV === "production") throw new Error("TASTETRAIL_JWT_SECRET is required in production");
  return {
    secret: new TextEncoder().encode(raw ?? "dev-only-insecure-secret-change-me-0123456789"),
    ttlSeconds: Number(env.TASTETRAIL_JWT_TTL_SECONDS ?? 7200),
  };
}

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export async function issueToken(userId: number, cfg: AuthConfig): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${cfg.ttlSeconds}s`)
    .sign(cfg.secret);
}

declare module "express-serve-static-core" {
  interface Request {
    userId?: number;
  }
}

/** Populates req.userId when a valid bearer token is present; rejects bad tokens. */
export function authenticate(cfg: AuthConfig, { required }: { required: boolean }) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return required ? next(new HttpError(401, "Not authenticated")) : next();
    }
    try {
      const { payload } = await jwtVerify(header.slice(7), cfg.secret, { algorithms: ["HS256"] });
      req.userId = Number(payload.sub);
      next();
    } catch {
      next(new HttpError(401, "Invalid or expired token"));
    }
  };
}
