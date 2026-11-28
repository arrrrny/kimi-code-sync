import { IConfigService } from '#/app/config/config';

import { SUBSCRIPTION_SECTION } from './configSection';

export { SUBSCRIPTION_SECTION } from './configSection';

export type SubscriptionMethodId = 'web_search' | 'fetch_url' | 'auto_session_title';

const SUBSCRIPTION_METHOD_DEFAULTS: Record<SubscriptionMethodId, boolean> = {
  web_search: true,
  fetch_url: true,
  auto_session_title: false,
};

export function isSubscriptionMethodEnabled(
  config: IConfigService,
  id: SubscriptionMethodId,
): boolean {
  const section = config.get(SUBSCRIPTION_SECTION) as Record<string, boolean> | undefined;
  return section?.[id] ?? SUBSCRIPTION_METHOD_DEFAULTS[id];
}
