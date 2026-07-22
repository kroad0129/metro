import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Response } from 'express';
import {
  UpstreamRateLimitedError,
  UpstreamUnavailableError,
} from '../../seoul-api/seoul-api.errors';
import { LineNotFoundError, StationNotFoundError } from '../../trains/trains.errors';

type Mapped = { status: number; code: string };

function classify(error: unknown): Mapped | null {
  if (error instanceof LineNotFoundError) return { status: 404, code: 'LINE_NOT_FOUND' };
  if (error instanceof StationNotFoundError) return { status: 404, code: 'STATION_NOT_FOUND' };
  if (error instanceof UpstreamRateLimitedError) return { status: 503, code: 'UPSTREAM_RATE_LIMITED' };
  if (error instanceof UpstreamUnavailableError) return { status: 502, code: 'UPSTREAM_UNAVAILABLE' };
  return null;
}

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const mapped = classify(error);

    if (mapped) {
      response.status(mapped.status).json({
        error: { code: mapped.code, message: (error as Error).message },
      });
      return;
    }

    if (error instanceof HttpException) {
      const body = error.getResponse();
      response.status(error.getStatus()).json(
        typeof body === 'object' && body !== null && 'error' in body
          ? body
          : { error: { code: 'HTTP_ERROR', message: error.message } },
      );
      return;
    }

    response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' },
    });
  }
}
