const BLOG_POSTS = [
  {
    title: 'How to reduce sourcing costs by 40%',
    description: 'A step-by-step guide to optimizing your global supply chain with automated product sourcing.',
    tag: 'Guide',
  },
  {
    title: 'The hidden costs of international shipping',
    description: 'Understanding freight surcharges, customs duties, and how to calculate the true cost of an order.',
    tag: 'Insights',
  },
];

export default function BlogSection() {
  return (
    <section className="py-20 sm:py-28 lg:py-32 bg-stone-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16">
          <p className="text-sm font-semibold text-rose-500 mb-3 tracking-wide uppercase">Blog</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-stone-900 mb-4">
            Insights & Resources
          </h2>
          <p className="text-base sm:text-lg text-stone-500 max-w-2xl mx-auto">
            Stay ahead with the latest tips on global sourcing, logistics, and ecommerce.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
          {BLOG_POSTS.map((post, i) => (
            <div
              key={i}
              className="group relative rounded-2xl sm:rounded-3xl overflow-hidden bg-linear-to-br from-stone-900 to-stone-800 min-h-60 sm:min-h-75 flex flex-col justify-end p-6 sm:p-8 cursor-pointer transition-all duration-500 hover:shadow-[0_16px_48px_-8px_rgba(0,0,0,0.25)] hover:-translate-y-1"
            >
              {/* Decorative linear overlay */}
              <div className="absolute inset-0 bg-linear-to-t from-stone-950/90 via-stone-900/40 to-transparent" />
              {/* Decorative blur orb */}
              <div className={`absolute ${i === 0 ? 'top-4 right-4' : 'top-4 left-4'} w-32 h-32 rounded-full ${i === 0 ? 'bg-rose-500/15' : 'bg-amber-500/15'} blur-[60px]`} />

              <div className="relative z-10">
                <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs font-semibold mb-4">
                  {post.tag}
                </span>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2 group-hover:text-rose-200 transition-colors">
                  {post.title}
                </h3>
                <p className="text-white/50 text-sm sm:text-base leading-relaxed">
                  {post.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}