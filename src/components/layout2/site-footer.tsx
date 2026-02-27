'use client';

import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="bg-linear-to-br bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <h3 className="font-bold mb-4 text-lg text-primary">Tomame</h3>
            <p className="text-sm">The simplest way to source products globally.</p>
          </div>
          <div>
            <h4 className="text-stone-200 font-semibold mb-4">Product</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/" className="hover:text-stone-200 transition-colors duration-200">How It Works</Link></li>
              <li><Link href="/pricing" className="hover:text-stone-200 transition-colors duration-200">Pricing</Link></li>
              <li><Link href="/features" className="hover:text-stone-200 transition-colors duration-200">Features</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-stone-200 font-semibold mb-4">Company</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/about" className="hover:text-stone-200 transition-colors duration-200">About</Link></li>
              <li><Link href="/blog" className="hover:text-stone-200 transition-colors duration-200">Blog</Link></li>
              <li><Link href="/careers" className="hover:text-stone-200 transition-colors duration-200">Careers</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-stone-200 font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/privacy" className="hover:text-stone-200 transition-colors duration-200">Privacy</Link></li>
              <li><Link href="/terms" className="hover:text-stone-200 transition-colors duration-200">Terms</Link></li>
              <li><Link href="/contact" className="hover:text-stone-200 transition-colors duration-200">Contact</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-stone-800 pt-8 text-center text-sm">
          <p>&copy; 2024 Tomame. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
