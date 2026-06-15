import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { installMockFetch } from './app/mock-fetch';

// Install the demo's fetch mocks BEFORE bootstrap so the devtools service
// captures the mocked fetch as its "original". The mock falls through to the
// real native fetch for any URL it doesn't recognize (assets, etc).
installMockFetch();

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
