// Sample handlers for the attack surface tests (F2.6), never run.
import { findOrderForUser } from '@/lib/orders';
import { requireUser } from '@/lib/session';

// Correct: needs a session and reads the order through the session user's id.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request);
  const order = await findOrderForUser(user.id, Number((await params).id));
  return Response.json({ order });
}
