import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiError } from '@agency-hub/shared';

/** Uniform error body; unexpected errors are logged in full but returned as a generic 500. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const b = body as { message?: string | string[]; error?: string };
        message = Array.isArray(b.message) ? b.message.join('; ') : (b.message ?? exception.message);
        error = b.error;
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    const payload: ApiError = { statusCode: status, message, error, path: req.path, timestamp: new Date().toISOString() };
    res.status(status).json(payload);
  }
}
