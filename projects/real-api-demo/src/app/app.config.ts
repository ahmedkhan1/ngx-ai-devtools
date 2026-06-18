import { ApplicationConfig } from '@angular/core';
import { provideAiDevtools } from 'ngx-ai-devtools';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAiDevtools({
      enabled: true,
      persist: true,
      maxCalls: 50,
      // Tell the devtools to intercept calls to our local proxy too.
      // The provider is detected from the path (/openai, /anthropic, /google).
      additionalEndpoints: ['localhost:8787/openai/chat', 'localhost:8787/anthropic/v1/messages'],
    }),
  ],
};
