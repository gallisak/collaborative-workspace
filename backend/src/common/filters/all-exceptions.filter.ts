import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ClsServiceManager } from 'nestjs-cls';
import { Prisma } from '../../generated/prisma/client.js';

export interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  correlationId?: string;
  path: string;
  timestamp: string;
}

const PRISMA_STATUS: Record<string, { status: HttpStatus; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT, message: 'Resource already exists' },
  P2003: { status: HttpStatus.CONFLICT, message: 'Related resource constraint failed' },
  P2004: { status: HttpStatus.CONFLICT, message: 'Database constraint failed' },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Resource not found' },
};

export function toErrorResponse(exception: unknown): Pick<ErrorBody, 'statusCode' | 'message'> {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    const message =
      typeof response === 'object' && response !== null && 'message' in response
        ? (response as { message: string | string[] }).message
        : exception.message;
    return { statusCode: exception.getStatus(), message };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = PRISMA_STATUS[exception.code];
    if (mapped) {
      return { statusCode: mapped.status, message: mapped.message };
    }
  }

  return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
}

const NOTABLE_CLIENT_ERRORS = new Set<number>([HttpStatus.CONFLICT, HttpStatus.TOO_MANY_REQUESTS]);

export function logLevelFor(statusCode: number): 'error' | 'warn' | 'debug' {
  if (statusCode >= 500) {
    return 'error';
  }
  return NOTABLE_CLIENT_ERRORS.has(statusCode) ? 'warn' : 'debug';
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const { statusCode, message } = toErrorResponse(exception);
    const cls = ClsServiceManager.getClsService();
    const correlationId = cls.isActive() ? cls.getId() : undefined;

    if (host.getType() !== 'http') {
      this.log(statusCode, exception, { message, transport: host.getType() });
      return;
    }

    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const body: ErrorBody = {
      statusCode,
      error: HttpStatus[statusCode] ?? 'ERROR',
      message,
      correlationId,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    };

    this.log(statusCode, exception, { message, path: req.originalUrl, method: req.method });
    res.status(statusCode).json(body);
  }

  private log(statusCode: number, exception: unknown, context: Record<string, unknown>) {
    const level = logLevelFor(statusCode);
    if (level === 'error') {
      this.logger.error({ err: exception, ...context }, 'Unhandled exception');
    } else {
      this.logger[level]({ statusCode, ...context }, 'Request rejected');
    }
  }
}
