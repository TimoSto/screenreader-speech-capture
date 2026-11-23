import { APP_STORES, createAppStores, type AppStores } from '#lib/composition.js';

/**
 * Mount options for a component that reads `appStores()`: fresh stores (or `stores`) under the
 * context key the root layout uses. Pass them to `render(Component, withAppStores(props))`.
 */
export function withAppStores<P extends Record<string, unknown>>(
  props: P = {} as P,
  stores: AppStores = createAppStores(),
): { props: P; context: Map<symbol, AppStores> } {
  return { props, context: new Map([[APP_STORES, stores]]) };
}
