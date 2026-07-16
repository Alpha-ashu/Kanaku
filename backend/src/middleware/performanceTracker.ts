import type { Request, Response, NextFunction } from 'express';

export function performanceTracker(req: any, res: any, next: NextFunction): void {
  req.startTime = process.hrtime.bigint();
  req.prismaDuration = 0;
  req.authDuration = 0;
  req.controllerStart = 0;

  const originalJson = res.json;
  res.json = function (body: any) {
    // 1. Measure Serialization time
    const serializeStart = process.hrtime.bigint();
    JSON.stringify(body);
    const serializeEnd = process.hrtime.bigint();
    const serializationMs = Number(serializeEnd - serializeStart) / 1_000_000;

    // 2. Compute other milestones
    const now = process.hrtime.bigint();
    const totalMs = Number(now - req.startTime) / 1_000_000;

    const authMs = req.authDuration || 0;
    const prismaMs = req.prismaDuration || 0;

    let controllerMs = 0;
    if (req.controllerStart) {
      controllerMs = Number(serializeStart - req.controllerStart) / 1_000_000 - prismaMs;
      if (controllerMs < 0) controllerMs = 0;
    }

    // Server-Timing format: name;dur=value, name;dur=value
    const serverTiming = [
      `request;dur=${totalMs.toFixed(2)}`,
      `auth;dur=${authMs.toFixed(2)}`,
      `controller;dur=${controllerMs.toFixed(2)}`,
      `prisma;dur=${prismaMs.toFixed(2)}`,
      `serialization;dur=${serializationMs.toFixed(2)}`
    ].join(', ');

    res.setHeader('Server-Timing', serverTiming);
    res.setHeader('X-Response-Time-Ms', totalMs.toFixed(2));

    return originalJson.call(this, body);
  };

  next();
}
