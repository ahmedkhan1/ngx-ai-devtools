import { ApplicationConfig } from '@angular/core';
import { provideAiDevtools } from 'ngx-ai-devtools';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAiDevtools({
      enabled: true,
      persist: true,
      maxCalls: 100,
      additionalEndpoints: ['?stream=1', '?err=1'],
    }),
  ],
};