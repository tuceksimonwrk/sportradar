import { createHandler, type Env } from './handler';

let handler: ReturnType<typeof createHandler> | undefined;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    handler ??= createHandler({
      fetch: (input, init) => fetch(input, init),
      cache: typeof caches !== 'undefined' ? caches.default : null,
    });
    try {
      return await handler(request, env, ctx);
    } catch {
      // žádné stack trace ven
      return new Response(JSON.stringify({ error: 'internal error' }), {
        status: 500, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', vary: 'Origin' },
      });
    }
  },
} satisfies ExportedHandler<Env>;
