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
      additionalEndpoints: [
        { path: '/ai1/v1/chat/completions', provider: 'openai' },
        { path: '/ai2/v1/messages', provider: 'anthropic' },
        { path: '/ai3/v1beta/models/gemini-2.5-flash:generateContent', provider: 'google' },
      ],
    }),
  ],
};
