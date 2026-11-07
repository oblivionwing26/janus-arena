// Public on purpose (F2.6 tests): the catalogue needs no session.
import { listProducts } from '@/lib/orders';

export async function GET() {
  return Response.json({ products: await listProducts() });
}
