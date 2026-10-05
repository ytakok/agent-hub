import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { provideEchartsCore } from 'ngx-echarts';
import { routes } from './app.routes';
import { authInterceptor } from './core/api/auth.interceptor';
import { LanguageService } from './core/i18n/language.service';
import { ThemeService } from './core/theme/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideTranslateService({
      // Relative to <base href>, so translations load at / and under a sub-path (GitHub Pages /agent-hub/).
      loader: provideTranslateHttpLoader({ prefix: 'i18n/', suffix: '.json' }),
      fallbackLang: 'he',
    }),
    // ECharts is loaded lazily, only when a chart widget scrolls into view.
    provideEchartsCore({ echarts: () => import('echarts') }),
    // Tenant theme + language must be ready before first paint to avoid a flash of wrong brand/direction.
    provideAppInitializer(async () => {
      const theme = inject(ThemeService);
      const language = inject(LanguageService);
      await theme.init();
      const t = theme.theme();
      await language.init(t?.locales.supported ?? ['he', 'en'], t?.locales.default ?? 'he');
    }),
  ],
};
