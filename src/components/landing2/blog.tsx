import { Card, CardFooter } from "../ui/card";

const BLOG_POSTS = [
  {
    title: "How to reduce sourcing costs by 40%",
    description:
      "A step-by-step guide to optimizing your global supply chain with automated product sourcing.",
    tag: "Guide",
  },
  {
    title: "The hidden costs of international shipping",
    description:
      "Understanding freight surcharges, customs duties, and how to calculate the true cost of an order.",
    tag: "Insights",
  },
];

export default function BlogSection() {
  return (
    <section className="py-20 sm:py-28 lg:py-32 bg-stone-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16">
          <p className="inline-block px-3 py-1 mb-3 rounded-full bg-primary/20 text-primary text-xs font-semibold tracking-wide uppercase">
            Blog
          </p>{" "}
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-stone-900 mb-4">
            Insights & Resources
          </h2>
          <p className="text-base sm:text-lg text-stone-500 max-w-2xl mx-auto">
            Stay ahead with the latest tips on global sourcing, logistics, and
            ecommerce.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
          {BLOG_POSTS.map((post, i) => (
            <Card
            variant="default"
              key={i}
              className="group relative rounded-2xl sm:rounded-3xl overflow-hidden gradient-secondary min-h-60 sm:min-h-75 flex flex-col justify-end p-6 sm:p-8 cursor-pointer transition-all duration-500 hover:shadow-primary/30 hover:-translate-y-1"
            >
              {/* Decorative linear overlay */}
              <div className="absolute inset-0 bg-primary" />
             

              <CardFooter className="relative z-10 flex-col items-start px-0">
                <span className="inline-block px-3 py-1 rounded-full bg-white/20 text-white/80 text-xs font-semibold mb-4">
                  {post.tag}
                </span>
                <h3 className="text-xl sm:text-2xl font-bold text-white/90 mb-2 group-hover:text-white transition-colors">
                  {post.title}
                </h3>
                <p className="text-white/70 text-sm sm:text-base leading-relaxed">
                  {post.description}
                </p>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
