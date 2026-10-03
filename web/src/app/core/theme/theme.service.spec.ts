import { TestBed } from '@angular/core/testing';
import { contrastText, ThemeService } from './theme.service';

describe('contrastText', () => {
  it('picks white text on dark brand colors and dark text on light ones', () => {
    expect(contrastText('#1f5eff')).toBe('#ffffff');
    expect(contrastText('#0f2a5c')).toBe('#ffffff');
    expect(contrastText('#fde047')).toBe('#0f172a');
  });

  it('falls back to white for invalid input', () => {
    expect(contrastText('not-a-color')).toBe('#ffffff');
  });
});

describe('ThemeService.applyBranding', () => {
  it('writes the tenant branding to CSS variables on :root', () => {
    const service = TestBed.inject(ThemeService);
    service.applyBranding({
      logoUrl: '/tenants/acme/logo.svg',
      colors: { primary: '#c2410c', secondary: '#431407', accent: '#ca8a04', bg: '#fffaf5', surface: '#ffffff', text: '#1c1917' },
      font: 'Assistant',
      radius: '6px',
    });
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--color-primary')).toBe('#c2410c');
    expect(style.getPropertyValue('--radius')).toBe('6px');
    expect(service.logoUrl()).toBe('/tenants/acme/logo.svg');
  });
});
