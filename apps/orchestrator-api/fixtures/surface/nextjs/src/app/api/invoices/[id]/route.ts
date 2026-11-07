// Incorrect on purpose (F2.6 tests): needs a session but reads any invoice by its id.
import { findInvoice } from '@/lib/orders';
import { requireUser } from '@/lib/session';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser(request);
  const invoice = await findInvoice(Number((await params).id));
  return Response.json({ invoice });
}
