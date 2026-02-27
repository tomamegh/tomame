import Link from "next/link";
import { Button } from "../ui/button";

export default function CTASection() {
  return (
    <section className='py-20 sm:py-28 lg:py-32 px-4 max-w-7xl mx-auto sm:px-6 lg:px-8'>
      <div className=" relative overflow-hidden bg-linear-to-b from-stone-950 via-stone-900 to-stone-950 text-white py-20 sm:py-20 rounded-3xl">
      {/* Decorative elements */}
      <div className="absolute top-[10%] left-[5%] size-120 rounded-full bg-rose-500/10 blur-[120px]" />
      <div className="absolute bottom-[10%] right-[5%] size-100 rounded-full bg-amber-500/8 blur-[100px]" />

      {/* Concentric rings */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-160 rounded-full border border-dashed border-white/4" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-md h-112 rounded-full border border-dashed border-white/6" />

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 sm:space-y-8">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
          Begin Your Free Trial
          <br />
          <span className="bg-linear-to-r from-rose-400 to-amber-400 bg-clip-text text-transparent">Today</span>
        </h2>
        <p className="text-base sm:text-lg text-white/50 max-w-xl mx-auto leading-relaxed">
          Join thousands of businesses already sourcing smarter. No credit card required — start with 5 free product links.
        </p>
        <div className="flex gap-3 sm:gap-4 justify-center flex-wrap">
          <Link href="/auth/signup">
            <Button variant="primary" size="lg">Get Started Free</Button>
          </Link>
          <Link href="/contact">
            <button className="px-7 py-3 text-base font-semibold rounded-xl border border-white/15 text-white hover:bg-white/5 transition-all duration-300 cursor-pointer">
              Talk to Sales
            </button>
          </Link>
        </div>
      </div>
    </div>
    </section>
  );
}