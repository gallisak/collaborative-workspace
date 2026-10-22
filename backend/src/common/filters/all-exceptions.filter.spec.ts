import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { logLevelFor, toErrorResponse } from './all-exceptions.filter.js';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test' });

describe('toErrorResponse', () => {
  it('keeps validation messages from HttpException', () => {
    const result = toErrorResponse(new BadRequestException(['email must be an email']));

    expect(result).toEqual({ statusCode: 400, message: ['email must be an email'] });
  });

  it('keeps status of plain HttpException', () => {
    expect(toErrorResponse(new NotFoundException('Product not found'))).toEqual({
      statusCode: 404,
      message: 'Product not found',
    });
  });

  it.each([
    ['P2002', HttpStatus.CONFLICT],
    ['P2003', HttpStatus.CONFLICT],
    ['P2025', HttpStatus.NOT_FOUND],
  ])('maps Prisma %s to %i', (code, status) => {
    expect(toErrorResponse(prismaError(code)).statusCode).toBe(status);
  });

  it('hides details of unknown errors', () => {
    const result = toErrorResponse(new Error('connection string with password'));

    expect(result).toEqual({ statusCode: 500, message: 'Internal server error' });
  });

  it('treats unmapped Prisma codes as internal errors', () => {
    expect(toErrorResponse(prismaError('P1001')).statusCode).toBe(500);
  });
});

describe('logLevelFor', () => {
  it.each([
    [500, 'error'],
    [503, 'error'],
    [409, 'warn'],
    [429, 'warn'],
    [400, 'debug'],
    [401, 'debug'],
    [404, 'debug'],
  ])('logs %i as %s', (status, level) => {
    expect(logLevelFor(status)).toBe(level);
  });
});
