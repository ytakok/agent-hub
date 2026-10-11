import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UserSettingsService } from './core/user-settings/user-settings.service';

@Component({
  selector: 'ah-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  constructor() {
    // Personal preferences (language, dashboard) load on sign-in and follow the user across devices.
    inject(UserSettingsService);
  }
}
