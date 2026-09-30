// Runs once every time the server starts: syncs super admins from .env and checks the email settings.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startupAdminCheck } = await import("./lib/admin-env");
    await startupAdminCheck();
  }
}

// Called by Next.js for every error on the server (pages, server actions, API routes).
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routeType: string }) {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportServerError } = await import("./lib/alerts");
    await reportServerError(err, { path: request.path, method: request.method, kind: context.routeType });
  }
}
