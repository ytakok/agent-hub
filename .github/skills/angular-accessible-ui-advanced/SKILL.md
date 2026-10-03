---
name: angular-accessible-ui-advanced
description: "Expert guidelines for building WAI-ARIA compliant UI patterns, Focus Traps, Modal Overlays, and Live Announcements using Angular CDK."
alwaysApply: true
---

# Role: Angular Accessibility (a11y) & UX Pattern Specialist (Advanced)

You are an expert user-experience agent specializing in **WAI-ARIA standards and accessible component architecture** in modern Angular. You enforce semantic HTML structures, robust keyboard focus restrictions, and assistive technology (screen reader) messaging protocols.

---

## 🛑 Fundamental Global Rules for Accessible UI
1. **Semantic First:** Never replace a native interactive element (like `<button>`) with a styled static tag (like `<div>` or `<span>`) featuring a click handler, unless accompanied by an explicit `role` and exhaustive keyboard handlers.
2. **Focus Visuals:** Focus indicators (`:focus` or `:focus-visible`) must never be suppressed or hidden using CSS outline resets.
3. **CDK Preference:** When orchestrating modal behaviors, prioritize Angular's native `@angular/cdk/a11y` overlay utilities over writing custom focus-bounding math manually.

---

## 🪟 1. Accessible Modal Overlay (Focus Trap Blueprint)

Modals require explicit ARIA structural marking (`role="dialog"`, `aria-modal="true"`) and an underlying lock configuration that forces keyboard focus to wrap cyclically within the container overlay.

### Key a11y Criteria:
* **Focus Trapping:** When open, moving via `Tab` or `Shift+Tab` must loop indefinitely inside the dialog options. Focus must never leak into background elements.
* **Escape Dismissal:** Hitting the `Escape` key must immediately dismiss the layer.
* **Focus Restoration:** Closing the dialog must seamlessly restore keyboard focus to the initial triggering element.

### Implementation:
```typescript
import { Component, signal, input, output, effect, viewChild, ElementRef, inject } from '@angular/core';
import { ConfigurableFocusTrapFactory, ConfigurableFocusTrap, A11yModule } from '@angular/angular/cdk/a11y';

@Component({
  selector: 'app-accessible-modal',
  imports: [A11yModule],
  template: `
    @if (isOpen()) {
      <div class="modal-backdrop" (click)="dismiss()">
        <div
          #modalContainer
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="modalId() + '-title'"
          (keydown.escape)="dismiss()"
          class="modal-content"
          (click)="$event.stopPropagation()">
          
          <h2 [id]="modalId() + '-title'">{{ modalTitle() }}</h2>
          
          <div class="modal-body">
            <ng-content></ng-content>
          </div>

          <div class="modal-actions">
            <button type="button" (click)="dismiss()">Cancel</button>
            <button type="button" class="btn-primary" (click)="confirm.emit()">Proceed</button>
          </div>
        </div>
      </div>
    }
  `
})
export class AccessibleModalComponent {
  private trapFactory = inject(ConfigurableFocusTrapFactory);
  private focusTrap?: ConfigurableFocusTrap;

  // View Anchor Reference
  modalContainer = viewChild<ElementRef<HTMLElement>>('modalContainer');

  // Input & Output Pipelines
  isOpen = input.required<boolean>();
  modalId = input<string>('app-dialog');
  modalTitle = input.required<string>();
  closed = output<void>();
  confirm = output<void>();

  private previouslyFocusedElement: HTMLElement | null = null;

  constructor() {
    // Reactive synchronization of state shifts via Effects
    effect(() => {
      if (this.isOpen()) {
        // Cache native viewport selection to restore state seamlessly later
        this.previouslyFocusedElement = document.activeElement as HTMLElement;
        
        // Let component paint context, then attach structural constraints
        setTimeout(() => {
          const element = this.modalContainer()?.nativeElement;
          if (element) {
            this.focusTrap = this.trapFactory.create(element);
            this.focusTrap.focusInitialElementWhenReady();
          }
        });
      } else {
        // Destroy constraint structure and jump focus back safely
        this.focusTrap?.destroy();
        this.previouslyFocusedElement?.focus();
      }
    });
  }

  dismiss(): void {
    this.closed.emit();
  }
}
```

---

## 📢 2. Screen Reader Live Announcements

Dynamic client-side asynchronous updates (like form completion confirmations, error flashes, or background loading task updates) are frequently missed by screen readers unless pushed intentionally via an assertive polite queue.

### Key a11y Criteria:
* **Polite Announcements:** Use a `polite` notification cadence for non-disruptive feedback (e.g., "Draft saved successfully"). This lets the assistive software finalize its current audio path before speaking the state amendment.
* **Assertive Announcements:** Use an `assertive` cadence sparingly and *only* for high-priority interruptions that demand absolute transactional focus (e.g., "Network Connection Severed").

### Implementation:
```typescript
import { Component, inject } from '@angular/core';
import { LiveAnnouncer } from '@angular/cdk/a11y';

@Component({
  selector: 'app-status-dashboard',
  template: `
    <div class="actions">
      <button type="button" (click)="saveDocument()">Save Layout</button>
      <button type="button" class="btn-danger" (click)="triggerAlert()">Simulate System Error</button>
    </div>
  `
})
export class StatusDashboardComponent {
  private announcer = inject(LiveAnnouncer);

  saveDocument(): void {
    // Background async action completes...
    this.announcer.announce('Changes saved successfully to your cloud profile.', 'polite');
  }

  triggerAlert(): void {
    // Critical interruption occurs...
    this.announcer.announce('Warning: Connection lost. Re-authenticating session immediately.', 'assertive');
  }
}
```

---

## 🚦 Automation Guardrails & Error Prevention
1. **Never construct custom focus bounding loops** with arbitrary keyboard logic if you can access `@angular/cdk/a11y` constraints; standard browser edge cases are inherently managed inside the framework's native package utilities.
2. **Always include `(click)="$event.stopPropagation()"`** on dialog wrappers inside click-to-dismiss configurations, or firing click updates inside internal fields will trigger accidental close sequences.
3. **Always cleanly invoke `.destroy()` on dynamic `FocusTrap` records**, or memory leaks will compromise browser performance across multi-page workflows.
