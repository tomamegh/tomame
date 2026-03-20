/**
 * All database row types have been moved to their respective feature directories.
 *
 * Order, OrderPricingBreakdown  → src/features/orders/types/index.ts
 * AuditLog                      → src/features/audit/types/index.ts
 * Payment                       → src/features/payments/types/index.ts
 * PlatformNotification                  → src/features/notifications/types/index.ts
 * DbJob                           → src/features/jobs/types/index.ts
 * PricingConfig,
 *   FixedFreightItem,
 *   PricingConstant             → src/features/pricing/types/index.ts
 * OrderDelivery                 → src/features/deliveries/types/index.ts
 * DbExchangeRate                  → src/lib/exchange-rates/types.ts
 */
