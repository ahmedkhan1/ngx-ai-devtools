import { APP_INITIALIZER, EnvironmentProviders, Provider, makeEnvironmentProviders } from '@angular/core';
import { AiDevtoolsService } from './ai-devtools.service';
import { AiDevtoolsConfig } from './types';

/**
 * Register ngx-ai-devtools in your app config:
 *
 * ```ts
 * import { provideAiDevtools } from 'ngx-ai-devtools';
 *
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideAiDevtools({ enabled: !environment.production }),
 *   ],
 * };
 * ```
 */
export function provideAiDevtools(config: AiDevtoolsConfig = {}): EnvironmentProviders {
  const providers: Provider[] = [
    AiDevtoolsService,
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: (svc: AiDevtoolsService) => () => svc.initialize(config),
      deps: [AiDevtoolsService],
    },
  ];
  return makeEnvironmentProviders(providers);
}
