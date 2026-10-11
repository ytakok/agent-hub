import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { AuthService } from './auth.service';
import { authGuard, guestGuard, onboardingGuard, verifyEmailGuard } from './guards';

interface FakeAuth {
  signedIn: boolean;
  verified: boolean;
  onboarding: boolean;
}

async function run(guard: typeof authGuard, state: FakeAuth): Promise<string | true> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          ready: () => Promise.resolve(),
          isAuthenticated: () => state.signedIn,
          emailVerified: () => state.verified,
          needsOnboarding: () => state.onboarding,
        },
      },
    ],
  });
  const result = await TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, { url: '/app/dashboard' } as RouterStateSnapshot),
  );
  return result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result).split('?')[0]! : (result as true);
}

describe('auth guards: email verification', () => {
  it('keeps unverified users out of the app', async () => {
    expect(await run(authGuard, { signedIn: true, verified: false, onboarding: false })).toBe('/auth/verify-email');
  });

  it('verifies the email before onboarding', async () => {
    expect(await run(authGuard, { signedIn: true, verified: false, onboarding: true })).toBe('/auth/verify-email');
    expect(await run(onboardingGuard, { signedIn: true, verified: false, onboarding: true })).toBe('/auth/verify-email');
    expect(await run(authGuard, { signedIn: true, verified: true, onboarding: true })).toBe('/auth/complete-profile');
  });

  it('lets verified members in', async () => {
    expect(await run(authGuard, { signedIn: true, verified: true, onboarding: false })).toBe(true);
  });

  it('shows the code page only while unverified', async () => {
    expect(await run(verifyEmailGuard, { signedIn: true, verified: false, onboarding: false })).toBe(true);
    expect(await run(verifyEmailGuard, { signedIn: true, verified: true, onboarding: false })).toBe('/app/dashboard');
    expect(await run(verifyEmailGuard, { signedIn: false, verified: false, onboarding: false })).toBe('/auth/login');
  });

  it('sends signed-in but unverified users from login/signup to the code page', async () => {
    expect(await run(guestGuard, { signedIn: true, verified: false, onboarding: false })).toBe('/auth/verify-email');
  });
});
