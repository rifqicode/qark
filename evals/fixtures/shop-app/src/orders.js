export const STATUSES = ['pending', 'paid', 'shipped', 'cancelled'];

const TRANSITIONS = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: [],
  cancelled: []
};

export function transition(order, next) {
  if (!TRANSITIONS[order.status]?.includes(next)) {
    throw new Error(`Cannot move order from ${order.status} to ${next}`);
  }
  return { ...order, status: next };
}
