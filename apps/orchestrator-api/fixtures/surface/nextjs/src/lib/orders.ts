export async function findOrderForUser(userId: number, id: number) {
  return { userId, id };
}

export async function findInvoice(id: number) {
  return { id };
}

export async function listProducts() {
  return [];
}
