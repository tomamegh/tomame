'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function PricingPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-center mb-4 bg-gradient-to-r from-rose-500 to-amber-500 bg-clip-text text-transparent">
        Transparent Pricing
      </h1>
      <p className="text-base sm:text-lg lg:text-xl text-stone-500 text-center mb-10 sm:mb-16 max-w-2xl mx-auto">
        No hidden fees. Just honest pricing with real cost breakdowns for every order.
      </p>

      {/* Pricing Breakdown */}
      <div className="bg-white rounded-3xl p-8 mb-16 border border-stone-200/40 shadow-[0_4px_24px_-4px_rgba(120,113,108,0.08)]">
        <h2 className="text-2xl font-bold mb-8 text-stone-800">How Our Fees Work</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h3 className="font-bold text-lg text-stone-800">Product Source Cost</h3>
            <p className="text-stone-500">The original price of the product on the ecommerce platform.</p>
            <p className="text-sm text-stone-400">Example: Amazon item for $50</p>
          </div>
          <div className="space-y-4">
            <h3 className="font-bold text-lg text-stone-800">Shipping Cost</h3>
            <p className="text-stone-500">Calculated based on weight and destination country using real carrier rates.</p>
            <p className="text-sm text-stone-400">Starts from $10 (US) to $30+ (International)</p>
          </div>
          <div className="space-y-4">
            <h3 className="font-bold text-lg text-stone-800">Freight Surcharge</h3>
            <p className="text-stone-500">Based on package weight. $3 per 0.5kg additional weight.</p>
            <p className="text-sm text-stone-400">0-0.5kg: $0 | 0.5-1kg: $3 | 1-1.5kg: $6</p>
          </div>
          <div className="space-y-4">
            <h3 className="font-bold text-lg text-stone-800">Service Fee</h3>
            <p className="text-stone-500">3% of product value. Covers our platform, support, and handling.</p>
            <p className="text-sm text-stone-400">$50 product = $1.50 service fee</p>
          </div>
          <div className="space-y-4 md:col-span-2">
            <h3 className="font-bold text-lg text-stone-800">Tax</h3>
            <p className="text-stone-500">Estimated Import/VAT taxes at 10% on total (shipping + product + fees).</p>
            <p className="text-sm text-stone-400">Actual tax varies by destination country</p>
          </div>
        </div>
      </div>

      {/* Example Calculations */}
      <h2 className="text-2xl font-bold mb-8 text-stone-800">Example Orders</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        {[
          {
            title: 'Light Package (US)',
            product: '$45',
            shipping: '$10',
            freight: '$0',
            service: '$1.35',
            tax: '$5.63',
            total: '$62.00',
            desc: '0.3kg to USA',
          },
          {
            title: 'Medium Package (EU)',
            product: '$120',
            shipping: '$20',
            freight: '$3',
            service: '$3.60',
            tax: '$14.66',
            total: '$161.26',
            desc: '0.8kg to Germany',
          },
          {
            title: 'Heavy Package (Asia)',
            product: '$200',
            shipping: '$25',
            freight: '$9',
            service: '$6.00',
            tax: '$24.00',
            total: '$264.00',
            desc: '2kg to Japan',
          },
        ].map((example) => (
          <Card key={example.title} variant="elevated">
            <CardHeader>
              <h3 className="font-bold text-lg text-stone-800">{example.title}</h3>
              <p className="text-sm text-stone-400">{example.desc}</p>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-stone-500">Product</span>
                <span className="font-semibold text-stone-800">{example.product}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Shipping</span>
                <span className="font-semibold text-stone-800">{example.shipping}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Freight</span>
                <span className="font-semibold text-stone-800">{example.freight}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Service Fee (3%)</span>
                <span className="font-semibold text-stone-800">{example.service}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Tax (10% est.)</span>
                <span className="font-semibold text-stone-800">{example.tax}</span>
              </div>
              <div className="border-t border-stone-200/60 pt-3 flex justify-between">
                <span className="font-bold text-stone-800">Total</span>
                <span className="font-bold text-lg bg-gradient-to-r from-rose-500 to-amber-500 bg-clip-text text-transparent">{example.total}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Features by Tier */}
      <h2 className="text-2xl font-bold mb-8 text-stone-800">Plans & Features</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            name: 'Starter',
            price: 'Free',
            description: 'Perfect for trying it out',
            features: [
              '5 product links/month',
              'Basic order tracking',
              'Email notifications',
              'Community support',
            ],
            highlight: false,
          },
          {
            name: 'Professional',
            price: '$29',
            period: '/month',
            description: 'For growing businesses',
            features: [
              'Unlimited product links',
              'Advanced order tracking',
              'Email & SMS notifications',
              'Priority support',
              'Bulk discount (2%)',
              'API access',
            ],
            highlight: true,
          },
          {
            name: 'Enterprise',
            price: 'Custom',
            description: 'For large operations',
            features: [
              'Everything in Pro',
              'Dedicated account manager',
              'Custom billing',
              'Training & onboarding',
              'SLA guaranteed',
              'Custom integrations',
            ],
            highlight: false,
          },
        ].map((plan) => (
          <Card
            key={plan.name}
            variant={plan.highlight ? 'gradient' : 'default'}
            className={plan.highlight ? 'scale-105 shadow-[0_16px_48px_-8px_rgba(244,63,94,0.15)]' : ''}
          >
            <CardHeader>
              <h3 className="text-2xl font-bold text-stone-800">{plan.name}</h3>
              <div className="mt-2">
                <span className="text-3xl font-bold bg-gradient-to-r from-rose-500 to-amber-500 bg-clip-text text-transparent">
                  {plan.price}
                </span>
                {plan.period && <span className="text-stone-500">{plan.period}</span>}
              </div>
              <p className="text-stone-500 text-sm mt-2">{plan.description}</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <ul className="space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <span className="text-emerald-500 text-lg">✓</span>
                    <span className="text-stone-600 text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                variant={plan.highlight ? 'primary' : 'secondary'}
                size="lg"
                className="w-full"
              >
                Get Started
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* FAQ */}
      <div className="mt-20">
        <h2 className="text-2xl font-bold mb-8 text-stone-800">Common Questions</h2>
        <div className="space-y-4">
          {[
            {
              q: 'Are there any hidden fees?',
              a: 'No. Every fee is itemized and shown before you confirm an order. Full transparency guaranteed.',
            },
            {
              q: 'Can I get a discount for bulk orders?',
              a: 'Yes! Professional and Enterprise plans get 2% discount on bulk orders (5+ items).',
            },
            {
              q: 'What if my product link fails?',
              a: 'We have multiple scraping methods as fallback. If all fail, we refund 100% of service fees.',
            },
            {
              q: 'Do you handle customs and import duty?',
              a: 'We estimate those in the quoted tax. Actual customs varies by country and HS codes.',
            },
          ].map((faq) => (
            <div key={faq.q} className="bg-white rounded-2xl p-6 border border-stone-200/40 shadow-[0_2px_16px_-4px_rgba(120,113,108,0.08)]">
              <h4 className="font-bold text-stone-800 mb-2">{faq.q}</h4>
              <p className="text-stone-500">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
