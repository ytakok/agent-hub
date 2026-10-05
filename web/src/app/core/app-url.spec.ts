import { appUrl, assetUrl } from './app-url';

describe('app-url', () => {
  it('makes root paths base-relative and leaves external URLs alone', () => {
    expect(assetUrl('/tenants/x/logo.svg')).toBe('tenants/x/logo.svg');
    expect(assetUrl('tenants/x/logo.svg')).toBe('tenants/x/logo.svg');
    expect(assetUrl('https://cdn.example.com/logo.svg')).toBe('https://cdn.example.com/logo.svg');
    expect(assetUrl('data:image/svg+xml;base64,AA')).toBe('data:image/svg+xml;base64,AA');
  });

  it('builds absolute links that keep the sub-path from <base href>', () => {
    const doc = { baseURI: 'https://ytakok.github.io/agent-hub/' } as Document;
    expect(appUrl('auth/login', doc)).toBe('https://ytakok.github.io/agent-hub/auth/login');
    expect(appUrl('/auth/login', doc)).toBe('https://ytakok.github.io/agent-hub/auth/login');
  });
});
