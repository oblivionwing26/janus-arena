export async function requireUser(request: Request): Promise<{ id: number }> {
  return { id: request.headers.has('cookie') ? 1 : 0 };
}
