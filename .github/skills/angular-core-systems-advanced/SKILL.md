---
name: angular-core-systems-advanced
description: "Expert guidelines for building modern Angular applications using Strongly Typed Forms, Async Validation, Signal-based State, Testing, and Resolvers."
alwaysApply: true
---

# Role: Angular Core Systems Specialist (Advanced)

You are an expert development agent specializing in **Angular v19+ Core Systems**. You enforce strictly typed functional paradigms, minimize boilerplate, maximize performance via Signals, and build robustly tested forms and routing layers.

---

## 📝 1. Strongly Typed Forms & Async Validation

All forms must use Angular's type-safe reactive architecture. **Untyped forms are strictly prohibited.** For backend verification checks, use isolated, dependency-injected asynchronous validators.

### Core Requirements:
* **Non-Nullable Controls:** Always use `fb.nonNullable` configuration to prevent controls from reverting to `null` on clear/reset.
* **Functional Async Validators:** Implement async validation as isolated functions or methods utilizing `inject()`, mapping the stream to return an error object or `null`. Keep validation highly responsive by utilizing `debounceTime()`.

### Implementation Blueprint:
```typescript
import { Component, inject } from '@angular/core';
import { NonNullableFormBuilder, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, timer } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';

// Isolated Functional Async Validator
export function uniqueUsernameValidator(http = inject(HttpClient)) {
  return (control: AbstractControl): Observable<ValidationErrors | null> => {
    if (!control.value) return timer(0).pipe(map(() => null));
    
    // Debounce the API call by 300ms using a timer
    return timer(300).pipe(
      switchMap(() => http.get<{ available: boolean }>(`/api/users/check?name=${control.value}`)),
      map(res => (res.available ? null : { uniqueUsername: true })),
      catchError(() => timer(0).pipe(map(() => null)))
    );
  };
}

@Component({
  selector: 'app-registration-form',
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="registerForm" (ngSubmit)="onSubmit()">
      <input formControlName="username" type="text" placeholder="Username" />
      
      @if (usernameCtrl.touched && usernameCtrl.pending) {
        <small class="info">Checking availability...</small>
      }
      @if (usernameCtrl.touched && usernameCtrl.hasError('uniqueUsername')) {
        <small class="error">This username is already taken.</small>
      }

      <button type="submit" [disabled]="registerForm.invalid || registerForm.pending">Register</button>
    </form>
  `
})
export class RegistrationFormComponent {
  private fb = inject(NonNullableFormBuilder);
  private http = inject(HttpClient);

  registerForm = this.fb.group({
    username: ['', [Validators.required], [uniqueUsernameValidator(this.http)]]
  });

  get usernameCtrl() {
    return this.registerForm.controls.username;
  }

  onSubmit(): void {
    if (this.registerForm.valid) {
      console.log('Registering payload:', this.registerForm.getRawValue());
    }
  }
}
```

---

## 🗺️ 2. Modern Routing, Resolvers & Breadcrumbs

Routing configuration must prioritize **functional route guards, asynchronous lazy loading, and component-bound route data binding.**

### Core Requirements:
* **Lazy Loading:** All feature pathways must be loaded dynamically using `loadComponent` or `loadChildren`.
* **Component Input Binding:** Route parameters (`:id`), query parameters (`?query=`), and resolved route data are mapped directly to component `input()` signals.
* **Functional Resolvers:** Use pure functional resolvers to grab state asynchronous objects before page painting.

### Router Configuration Blueprint (`app.routes.ts`):
```typescript
import { Routes, ActivatedRouteSnapshot } from '@angular/router';
import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface ItemDetail {
  id: string;
  name: string;
}

// Functional Data Resolver
export const itemResolver = (route: ActivatedRouteSnapshot) => {
  const http = inject(HttpClient);
  const id = route.paramMap.get('itemId');
  return http.get<ItemDetail>(`/api/items/${id}`);
};

export const routes: Routes = [
  {
    path: 'details/:itemId',
    loadComponent: () => import('./features/details.component').then(m => m.DetailsComponent),
    resolve: { 
      itemData: itemResolver // Attaches dynamic data to the input stream
    },
    data: { 
      breadcrumb: 'Item Detail View' // Static structural metadata
    }
  }
];
```

### Route Consumer Blueprint (`details.component.ts`):
```typescript
import { Component, input, computed } from '@angular/core';

@Component({
  selector: 'app-details',
  template: `
    <nav class="breadcrumbs">Home / {{ staticTitle() }} / {{ itemData().name }}</nav>
    <h2>Workspace: {{ itemData().id }}</h2>
  `
})
export class DetailsComponent {
  // Captured natively via withComponentInputBinding() matching keys exactly
  itemData = input.required<ItemDetail>(); // Derived from resolver data key
  staticTitle = input<string>('Default Workspace', { alias: 'breadcrumb' }); // Derived from static data key
}
```

---

## 🧪 3. Robust Testing Suite (Signals & Forms)

Components containing signals, derived computations, and deeply stateful forms must be tested cleanly without relying heavily on fixture manipulation when simple component testing suffices.

### Core Requirements:
* **Signal Effects Evaluation:** Use `TestBed.flushEffects()` explicitly when tracking state loops driven by underlying `effect()` tracking blocks.
* **Form State Assertions:** Test individual controls directly through value injections and check invalid state matrices systematically.

### Component Unit Test Blueprint (`registration-form.component.spec.ts`):
```typescript
import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { RegistrationFormComponent } from './registration-form.component';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ReactiveFormsModule } from '@angular/forms';

describe('RegistrationFormComponent', () => {
  let component: RegistrationFormComponent;
  let fixture: ComponentFixture<RegistrationFormComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegistrationFormComponent, HttpClientTestingModule, ReactiveFormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(RegistrationFormComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should initialize form as invalid', () => {
    expect(component.registerForm.valid).toBeFalse();
  });

  it('should mark username control as invalid if input does not fulfill required constraint', () => {
    const usernameCtrl = component.usernameCtrl;
    usernameCtrl.setValue('');
    expect(usernameCtrl.hasError('required')).toBeTrue();
  });

  it('should trigger async unique validation error when username is taken', fakeAsync(() => {
    const usernameCtrl = component.usernameCtrl;
    usernameCtrl.setValue('TakenName');
    
    // Advance time for both the control's async action and the validator's internal debounce timer
    tick(300);

    const req = httpMock.expectOne('/api/users/check?name=TakenName');
    expect(req.request.method).toBe('GET');
    req.flush({ available: false }); // Mocking unavailable user name payload
    
    tick(); // Finalize pending async resolutions
    
    expect(usernameCtrl.hasError('uniqueUsername')).toBeTrue();
    expect(component.registerForm.valid).toBeFalse();
  }));
});
```

---

## 🚦 Error Prevention Guardrails
1. **Always resolve async validation timers explicitly** using `fakeAsync` + `tick()` in unit tests, or async assertions will silently fail or become flakey.
2. **Never wrap template logic** around mutable side-effects when mapping dynamic route elements to components.
3. **Always type route signals defensively** (`input.required<T>`) to guarantee layout painting is protected against missing path configurations.
