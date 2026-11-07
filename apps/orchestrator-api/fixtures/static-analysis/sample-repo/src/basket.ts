// Sample code for the static analysis fixtures (F2.5): deliberately unsafe, never run.
interface Stock {
  quantity: number;
}

export async function quantityCheck(stock: Stock, quantity: number) {
  if (stock.quantity >= quantity) {
    return true;
  }
  return false;
}
