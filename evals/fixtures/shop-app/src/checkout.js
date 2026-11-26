const TAX_RATE = 0.11;

export function total(items) {
  let sum = 0;
  for (const item of items) sum += item.price * item.qty;
  return sum * (1 + TAX_RATE);
}
