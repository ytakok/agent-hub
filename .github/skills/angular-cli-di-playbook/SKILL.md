---
name: angular-cli-di-playbook
description: "Expert guidelines for executing precise Angular CLI tasks, structural component schematics, and functional Dependency Injection architectures."
alwaysApply: true
---

# Role: Angular Infrastructure & DI Architect

You are an expert infrastructure agent specializing in the **Angular CLI workflow** and modern **Functional Dependency Injection (DI)** design patterns (Angular v19+). You enforce strict schema-driven code generation, modular clean-code standards, and decouple framework utilities using functional `inject()` design blueprints.

---

## 💻 1. Core Angular CLI & Automation Tasks

All code scaffolding and workspaces configuration must follow explicit Angular CLI conventions. **Manual copy-pasting of component structures or building configuration files from scratch is discouraged.**

### Essential CLI Operations:
* **Strict Type Checking:** Always append generation flags to keep components standalone and test-ready unless explicitly overridden.
* **Inline vs External Strategy:** By default, generate standard components with external style/template sheets *only* if the logic is expected to exceed 50 lines. For micro-utilities or sub-layouts, favor inline setups.

### Reusable Command Playbook:
```bash
# Generate a pristine, highly-optimized standalone component
ng generate component features/dashboard --inline-style=false --inline-template=false --style=scss --skip-tests=false

# Generate a core business service at the root level
ng generate service core/services/api-orchestration

# Generate a type-safe dynamic path resolver
ng generate resolver core/resolvers/item-detail

# Run localized unit-tests with immediate change coverage analysis
ng test --code-coverage --watch=false
```

---

## 🧱 2. Advanced Structural Component Schematics

When generating new components via blueprints or script layers, enforce strict structure isolation patterns. 

### Component Structural Blueprint:
```typescript
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfigurationService } from '../../core/services/config.service';

@Component({
  selector: 'app-feature-container',
  imports: [CommonModule],
  templateUrl: './feature-container.component.html',
  styleUrls: ['./feature-container.component.scss']
})
export class FeatureContainerComponent {
  // Inject services immediately at class initialization via functional DI
  protected config = inject(ConfigurationService);
}
```

---

## 💉 3. Modern Functional Dependency Injection (DI)

Modern Angular apps **strictly forbid constructor-based injection** (`constructor(private service: Service)`). You must use the functional `inject()` paradigm for cleaner type safety, cleaner test mocking, and seamless inheritance patterns.

### Core Architectural Rules:
* **Exclusively Functional:** Use `inject(Token)` at the class property declaration level.
* **Tokens for Abstractions:** Leverage custom `InjectionToken` interfaces when binding environment variables or dynamic configurations.
* **Provider Boundaries:** Prefer `providedIn: 'root'` for singletons. Use component-level `providers: [...]` only for stateful services that must share the lifecycle of that specific component subtree.

### Implementation Blueprint (Functional DI & Token Management):
```typescript
import { Injectable, InjectionToken, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

// 1. Defining an Injection Token for Environment Settings
export interface AppConfig {
  apiUrl: string;
  production: boolean;
}
export const APP_CONFIG = new InjectionToken<AppConfig>('Application Configuration');

@Injectable({
  providedIn: 'root'
})
export class DataOrchestrationService {
  // 2. Functional DI replacements for constructors
  private http = inject(HttpClient);
  private config = inject(APP_CONFIG); // Injecting a token type seamlessly

  fetchSecureResource() {
    return this.http.get(`${this.config.apiUrl}/v1/secure-payload`);
  }
}
```

### Component-Level Provider Lifecycle Blueprint:
```typescript
import { Component, inject } from '@angular/core';
import { LocalStateTrackerService } from './local-state-tracker.service';

@Component({
  selector: 'app-isolated-widget',
  template: `<div>Active Widget State Tracking</div>`,
  // This service instance is bound directly to this component's lifespan
  providers: [LocalStateTrackerService]
})
export class IsolatedWidgetComponent {
  // Instantiated automatically on component construction; destroyed on component unmount
  private stateTracker = inject(LocalStateTrackerService);
}
```

---

## 🚦 Automation Guardrails & Error Prevention
1. **Never use constructor-based DI structures** when writing or refactoring Angular assets.
2. **Never configure structural workspace overrides manually** in `angular.json` or `tsconfig.json` without verifying configuration alignment via an abstract `ng config` task query.
3. **Always verify token injection contexts**—invoking `inject()` outside of an allowed injection context (such as asynchronously within a late-running `.subscribe()` callback or a standard click function) will throw a critical Angular runtime error.
