export const LIVE_ORDER_STATUSES = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'CUSTOMER_ARRIVED', 'COLLECTED'] as const;

const TRANSITIONS: Record<string, readonly string[]> = {
  PENDING: ['ACCEPTED'],
  ACCEPTED: ['PREPARING'],
  PREPARING: ['READY'],
  READY: ['CUSTOMER_ARRIVED', 'COLLECTED'],
  CUSTOMER_ARRIVED: ['COLLECTED'],
  COLLECTED: ['COMPLETED'],
};

export function allowedOrderTransitions(status: string): readonly string[] {
  return TRANSITIONS[status] || [];
}

export function canTransitionOrder(from: string, to: string): boolean {
  return allowedOrderTransitions(from).includes(to);
}
