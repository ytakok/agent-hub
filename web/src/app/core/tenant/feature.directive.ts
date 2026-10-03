import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import type { FeatureKey } from '@agency-hub/shared';
import { TenantConfigService } from './tenant-config.service';

/**
 * Renders content only when the tenant has the feature(s) enabled.
 *
 *   <a *ahFeature="'module.messages'" routerLink="/app/messages">…</a>
 *   <section *ahFeature="['integration.whatsapp', 'module.messages']; else upsell">…</section>
 */
@Directive({ selector: '[ahFeature]' })
export class FeatureDirective {
  private readonly tpl = inject(TemplateRef);
  private readonly vcr = inject(ViewContainerRef);
  private readonly tenantConfig = inject(TenantConfigService);

  readonly ahFeature = input.required<FeatureKey | FeatureKey[]>();
  readonly ahFeatureElse = input<TemplateRef<unknown> | null>(null);

  private shown: boolean | null = null;

  constructor() {
    effect(() => {
      const keys = ([] as FeatureKey[]).concat(this.ahFeature());
      const on = keys.every((k) => this.tenantConfig.isEnabled(k));
      const elseTpl = this.ahFeatureElse();
      if (on === this.shown) return;
      this.shown = on;
      this.vcr.clear();
      if (on) this.vcr.createEmbeddedView(this.tpl);
      else if (elseTpl) this.vcr.createEmbeddedView(elseTpl);
    });
  }
}
