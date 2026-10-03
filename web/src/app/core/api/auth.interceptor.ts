import { HttpErrorResponse, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { FirebaseService } from '../firebase/firebase.service';
import { LanguageService } from '../i18n/language.service';

/**
 * Adds the Firebase ID token (+ App Check token) to API calls only — never to third-party URLs.
 * On 401 it force-refreshes the token once (e.g. after claims changed), then signs out.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) return next(req);

  const auth = inject(AuthService);
  const firebase = inject(FirebaseService);
  const lang = inject(LanguageService).lang();

  const send = (forceRefresh: boolean) =>
    from(Promise.all([auth.getIdToken(forceRefresh), firebase.getAppCheckToken()])).pipe(
      switchMap(([token, appCheck]) => next(withHeaders(req, token, appCheck, lang))),
    );

  return send(false).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || !auth.isAuthenticated()) return throwError(() => err);
      return send(true).pipe(
        catchError((retryErr: unknown) => {
          if (retryErr instanceof HttpErrorResponse && retryErr.status === 401) void auth.logout();
          return throwError(() => retryErr);
        }),
      );
    }),
  );
};

function withHeaders(req: HttpRequest<unknown>, token: string | null, appCheck: string | null, lang: string): HttpRequest<unknown> {
  const headers: Record<string, string> = { 'Accept-Language': lang };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (appCheck) headers['X-Firebase-AppCheck'] = appCheck;
  return req.clone({ setHeaders: headers });
}
