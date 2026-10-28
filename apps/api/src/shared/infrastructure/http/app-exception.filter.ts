import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
  type LoggerService,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from '../../domain/domain-error.js';
import { ERROR_STATUS } from './error-status.js';

interface ErrorBody {
  code: string;
  message: string;
}

const INTERNAL: ErrorBody = { code: 'INTERNAL_ERROR', message: 'erro interno' };

/** Códigos para as exceções do próprio Nest (rota inexistente, JSON inválido). */
const HTTP_CODES: Readonly<Record<number, string>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  404: 'NOT_FOUND',
};

/**
 * Toda exceção sai como `{ code, message }` (seção 8.1, D58). Status 500 é
 * bug: mensagem genérica para o cliente e o erro completo no log.
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly logger: Pick<LoggerService, 'error'> = new Logger(
      'AppExceptionFilter',
    ),
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const { status, body } = classify(exception);

    if (status >= 500) {
      const request = http.getRequest<Request>();
      const code = exception instanceof DomainError ? ` ${exception.code}` : '';
      this.logger.error(
        `${request.method} ${request.url} falhou${code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    http.getResponse<Response>().status(status).json(body);
  }
}

function classify(exception: unknown): { status: number; body: ErrorBody } {
  if (exception instanceof DomainError) {
    const status = ERROR_STATUS[exception.code] ?? 500;
    return status >= 500
      ? { status, body: INTERNAL }
      : { status, body: { code: exception.code, message: exception.message } };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return status >= 500
      ? { status, body: INTERNAL }
      : {
          status,
          body: {
            code: HTTP_CODES[status] ?? 'HTTP_ERROR',
            message: exception.message,
          },
        };
  }
  return { status: 500, body: INTERNAL };
}
