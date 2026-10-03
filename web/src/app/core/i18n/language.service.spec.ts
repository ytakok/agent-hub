import { TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateLoader } from '@ngx-translate/core';
import { of } from 'rxjs';
import { LanguageService } from './language.service';

class StubLoader implements TranslateLoader {
  getTranslation() {
    return of({});
  }
}

describe('LanguageService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTranslateService({ loader: { provide: TranslateLoader, useClass: StubLoader } })],
    });
    localStorage.clear();
  });

  it('starts in the tenant default language and sets <html dir>', async () => {
    const service = TestBed.inject(LanguageService);
    await service.init(['he', 'en'], 'he');
    expect(service.lang()).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('he');
  });

  it('flips direction when switching to English and remembers the choice', async () => {
    const service = TestBed.inject(LanguageService);
    await service.init(['he', 'en'], 'he');
    const onChange = vi.fn();
    service.onUserChange = onChange;

    await service.use('en');

    expect(service.dir()).toBe('ltr');
    expect(document.documentElement.dir).toBe('ltr');
    expect(localStorage.getItem('ah.lang')).toBe('en');
    expect(onChange).toHaveBeenCalledWith('en');
  });

  it('ignores languages the tenant does not support', async () => {
    const service = TestBed.inject(LanguageService);
    await service.init(['he'], 'he');
    await service.use('en');
    expect(service.lang()).toBe('he');
  });
});
