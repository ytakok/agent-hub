import { CallHandler, ExecutionContext, Inject, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { Reflector } from '@nestjs/core';
import { tap, type Observable } from 'rxjs';
import { SKIP_AUDIT } from '../decorators/index.js';
import { FIRESTORE } from '../../firebase/firebase.module.js';
import type { AuthedRequest } from '../request-user.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Appends a record to tenants/{tid}/auditLogs for every successful tenant mutation. Never blocks the response. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly reflector: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!MUTATING.has(req.method)) return next.handle();
    if (this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT, [ctx.getHandler(), ctx.getClass()])) return next.handle();

    return next.handle().pipe(
      tap(() => {
        // Read the user after the handler: bootstrap assigns the tenant during the request.
        const user = req.user;
        if (!user?.tenantId) return;
        this.db
          .collection(`tenants/${user.tenantId}/auditLogs`)
          .add({
            actorUid: user.uid,
            action: `${req.method} ${req.route?.path ?? req.path}`,
            entity: ctx.getClass().name.replace(/Controller$/, ''),
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            at: FieldValue.serverTimestamp(),
          })
          .catch((err: unknown) => this.logger.warn(`Audit write failed: ${String(err)}`));
      }),
    );
  }
}
