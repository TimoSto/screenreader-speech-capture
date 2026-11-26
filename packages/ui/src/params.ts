import { defineParams } from '@sveltejs/kit/params';

/**
 * The route param matchers (`[name=matcher]`). They run in the browser too, and the build loads
 * this file in plain Node, so it imports nothing of the app: `params.test.ts` checks that `id`
 * agrees with `parseScope` (`lib/core/sessions.ts`).
 */
export const params = defineParams({
  /** A session id (`[id=id]`), as a number: anything the bridge couldn't have handed out is a 404. */
  id: (param) => {
    if (!/^[1-9]\d*$/.test(param)) return undefined;
    const id = Number(param);
    return Number.isSafeInteger(id) ? id : undefined;
  },
});
