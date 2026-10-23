import type { NextFunction, Request, Response } from 'express';
import type { MetricsService } from './metrics.service.js';

const UNMATCHED = 'unmatched';

export function routeLabel(req: Pick<Request, 'baseUrl'> & { route?: { path?: unknown } }) {
  const path = req.route?.path;
  return typeof path === 'string' ? `${req.baseUrl}${path}` : UNMATCHED;
}

export function httpMetrics(metrics: MetricsService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const stop = metrics.httpRequestDuration.startTimer({ method: req.method });
    res.on('finish', () => stop({ route: routeLabel(req), status: String(res.statusCode) }));
    next();
  };
}
