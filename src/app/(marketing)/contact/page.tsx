import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MailIcon, MapPinIcon } from 'lucide-react';
import { ContactForm } from '@/features/contact/components';

export default function ContactPage() {

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-center mb-4 bg-linear-to-r from-rose-500 to-amber-500 bg-clip-text text-transparent">
        Get in Touch
      </h1>
      <p className="text-base sm:text-lg lg:text-xl text-stone-500 text-center mb-10 sm:mb-16 max-w-2xl mx-auto">
        Have a question or need support? We&apos;d love to hear from you. Our team typically responds within 24 hours.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
        {[
          {
            icon: MailIcon,
            title: 'Email',
            value: 'support@tomame.io',
            desc: 'Our fastest way to reach us',
          },
          {
            icon: MailIcon,
            title: 'Live Chat',
            value: 'Available 9am-9pm EST',
            desc: 'Real-time support for urgent issues',
          },
          {
            icon: MapPinIcon,
            title: 'Office',
            value: 'San Francisco, CA',
            desc: 'Serving clients worldwide',
          },
        ].map((contact) => (
          <Card key={contact.title} variant='elevated' className="text-center">
            <CardContent className="py-8 space-y-4">
              <div className="text-4xl mx-auto rounded-full p-2 bg-rose-500/10 text-center w-fit"><contact.icon size={32}/></div>
              <h3 className="font-bold text-lg text-stone-800">{contact.title}</h3>
              <p className="font-semibold text-stone-800">{contact.value}</p>
              <p className="text-sm text-stone-500">{contact.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Form */}
        <ContactForm />

        {/* Info */}
        <div className="space-y-8">
          <div>
            <h3 className="text-xl font-bold text-stone-800 mb-4">Why Tomame?</h3>
            <p className="text-stone-500 mb-6">
              We&apos;re not just a platform - we&apos;re a partner in your global commerce journey. Our team is committed to your success.
            </p>
            <ul className="space-y-3">
              {[
                '24/7 customer support',
                'Fast response times (usually under 2 hours)',
                'Dedicated account managers for Enterprise',
                'Regular product updates and improvements',
                'Community discord with other users',
              ].map((item) => (
                <li key={item} className="flex gap-3 text-stone-500">
                  <span className="text-emerald-500 font-bold">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <Card variant="gradient" className='bg-linear-to-br from-stone-950 via-stone-900 to-stone-950'>
            <CardContent className="py-8 px-8 space-y-4">
              <h3 className="font-bold text-lg text-stone-300">Community</h3>
              <p className="text-sm text-stone-300">
                Join 5000+ users in our Discord community. Share tips, strategies, and connect with fellow sourcing professionals.
              </p>
                <Button variant="primary" className='ml-auto px-8'>
                Join Discord
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
