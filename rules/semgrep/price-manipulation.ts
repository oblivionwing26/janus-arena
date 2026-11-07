// Test cases for price-manipulation.yaml: `ruleid` lines must match, `ok` lines must not.

interface Stock {
  quantity: number;
  limitPerUser?: number;
}

async function quantityCheck(stock: Stock, quantity: number, next: () => void) {
  // ruleid: janus.quantity-upper-bound-only
  if (!stock.limitPerUser || stock.limitPerUser >= quantity) {
    // ruleid: janus.quantity-upper-bound-only
    if (stock.quantity >= quantity) {
      next();
    }
  }
}

async function checkedQuantity(stock: Stock, quantity: number, next: () => void) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error('quantity must be a positive integer');
  }
  // ok: janus.quantity-upper-bound-only
  if (stock.quantity >= quantity) {
    next();
  }
}

function checkedPrice(price: number, max: number) {
  if (price <= 0) return false;
  // ok: janus.quantity-upper-bound-only
  return price < max;
}

function notAQuantity(width: number, max: number) {
  // ok: janus.quantity-upper-bound-only
  return width <= max;
}

export { quantityCheck, checkedQuantity, checkedPrice, notAQuantity };
