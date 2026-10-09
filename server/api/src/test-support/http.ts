import express, { type Router } from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'node:net';
import { TEST_JWT_SECRET } from './env.js';

/**
 * Real HTTP against a real router, for route tests.
 *
 * The router is mounted on a bare Express app with the real JSON parser and
 * the real error handler, and called with `fetch` on a random port. Auth is
 * the real middleware with a real JWT signed by the test secret, so a test
 * proves the guard (401/403), the validation (400) and the handler together —
 * which is where the checkup of 23/08 found every authorization hole.
 */

export type Role = 'admin' | 'seller' | 'member';

export function tokenFor(role: Role, userId = `user-${role}`, email = `${role}@example.com`): string {
  return jwt.sign({ userId, email, role }, TEST_JWT_SECRET, { expiresIn: '1h' });
}

export interface CallOptions {
  as?: Role;
  body?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
}

export interface CallResult {
  status: number;
  headers: Headers;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  text: string;
}

/**
 * `raw: true` mounts the router behind `express.raw`, as index.ts does for the
 * webhooks: signature checks need the exact bytes, not a re-serialised object.
 */
export function routerClient(mount: string, router: Router, { raw = false }: { raw?: boolean } = {}) {
  async function call(method: string, path: string, opts: CallOptions = {}): Promise<CallResult> {
    // Lazy: the error handler imports the env module, which the test mocks.
    const { errorHandler } = await import('../middleware/error-handler.js');
    const app = express();
    // As in src/index.ts: one proxy (nginx) in front, so req.ip is the address it saw.
    app.set('trust proxy', 1);
    app.use(raw ? express.raw({ type: '*/*' }) : express.json());
    app.use(mount, router);
    app.use(errorHandler);

    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    try {
      const { port } = server.address() as AddressInfo;
      const headers: Record<string, string> = { ...(opts.headers ?? {}) };
      if (opts.as) headers.Authorization = `Bearer ${tokenFor(opts.as)}`;
      let body: string | FormData | undefined;
      if (opts.form) body = opts.form;
      // fetch refuses a body on GET/HEAD; a test that passes one anyway
      // (a table-driven guard check, say) means "no body".
      else if (opts.body !== undefined && method !== 'GET' && method !== 'HEAD') {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(opts.body);
      }
      // Never follow a redirect: it would leave the test for a real host.
      const res = await fetch(`http://127.0.0.1:${port}${mount}${path}`, {
        method,
        headers,
        body,
        redirect: 'manual',
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : undefined;
      } catch {
        /* not JSON: keep the text */
      }
      return { status: res.status, headers: res.headers, body: parsed, text };
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  return {
    get: (path: string, opts?: CallOptions) => call('GET', path, opts),
    post: (path: string, opts?: CallOptions) => call('POST', path, opts),
    put: (path: string, opts?: CallOptions) => call('PUT', path, opts),
    patch: (path: string, opts?: CallOptions) => call('PATCH', path, opts),
    delete: (path: string, opts?: CallOptions) => call('DELETE', path, opts),
  };
}
