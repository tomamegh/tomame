/**
 * All database row types have been moved to their respective feature directories.
 *
 * DbOrder, OrderPricingBreakdown  → src/features/orders/types/index.ts
 * DbAuditLog                      → src/features/audit/types/index.ts
 * DbPayment                       → src/features/payments/types/index.ts
 * DbNotification                  → src/features/notifications/types/index.ts
 * DbJob                           → src/features/jobs/types/index.ts
 * DbPricingConfig,
 *   DbFixedFreightItem,
 *   DbPricingConstant             → src/features/pricing/types/index.ts
 * DbOrderDelivery                 → src/features/deliveries/types/index.ts
 * DbExchangeRate                  → src/lib/exchange-rates/types.ts
 */
