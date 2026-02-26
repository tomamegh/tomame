export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen relative flex flex-col lg:flex-row overflow-hidden">
      {/* Centered split card */}
      {/* <div className="relative z-10 flex flex-col lg:flex-row overflow-hidden"> */}
      {/* Left branded panel */}
      <div className="hidden lg:flex lg:w-[45%] relative bg-linear-to-br from-rose-500 via-orange-500 to-amber-500 overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-white/10" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[50%] rounded-full bg-white/10" />
        <div className="absolute top-[40%] right-[10%] w-[20%] h-[20%] rounded-full bg-white/5" />

        <div className="relative z-10 flex flex-col justify-between p-10 xl:p-12 w-full">
          <div>
            <h2 className="text-white text-2xl font-bold">Tomame</h2>
          </div>

          <div className="space-y-6">
            <h1 className="text-white text-3xl xl:text-4xl font-bold leading-tight">
              Source products globally with confidence.
            </h1>
            <p className="text-white/70 text-base max-w-sm">
              Transparent pricing, real-time tracking, and a platform built for
              modern commerce.
            </p>

            <div className="space-y-3">
              {[
                "No hidden fees - ever",
                "Real-time order tracking",
                "50+ countries supported",
                "Enterprise-grade security",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <span className="text-white text-xs">✓</span>
                  </div>
                  <span className="text-white/80 text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex -space-x-2">
              {["A", "B", "C", "D"].map((letter) => (
                <div
                  key={letter}
                  className="w-8 h-8 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-white text-xs font-bold"
                >
                  {letter}
                </div>
              ))}
            </div>
            <p className="text-white/70 text-sm">
              Trusted by{" "}
              <span className="text-white font-semibold">5,000+</span>{" "}
              businesses
            </p>
          </div>
        </div>
      </div>

      {/* Mobile header (shown only on small screens) */}
      <div className="lg:hidden bg-linear-to-r from-rose-500 via-orange-500 to-amber-500 px-6 py-6 text-center">
        <h2 className="text-white text-xl font-bold mb-1">Tomame</h2>
        <p className="text-white/70 text-sm">
          Global product sourcing made simple
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center bg-white px-8 py-10 lg:px-12 lg:py-14">
        <div className="w-full max-w-md">{children}</div>
      </div>
      {/* </div> */}
    </main>
  );
}
