"use client";

import { Card, CardContent } from "@/components/ui/card";
import { BlendIcon, GemIcon, GlobeIcon, RocketIcon, ShieldCheckIcon } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-center mb-4 bg-linear-to-r from-rose-500 to-amber-500 bg-clip-text text-transparent">
        About Tomame
      </h1>
      <p className="text-base sm:text-lg lg:text-xl text-stone-500 text-center mb-10 sm:mb-20 max-w-2xl mx-auto">
        We&apos;re simplifying global commerce for businesses and entrepreneurs
        worldwide.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-24">
        <div className="space-y-6">
          <h2 className="text-3xl font-bold text-stone-800">Our Mission</h2>
          <p className="text-stone-500 leading-relaxed">
            At Tomame, we believe that global commerce should be accessible to
            everyone. We&apos;re removing friction from product sourcing by combining
            intelligent data extraction, transparent pricing, and reliable
            logistics.
          </p>
          <p className="text-stone-500 leading-relaxed">
            Our platform connects you directly to millions of products globally,
            eliminating middlemen and hidden costs.
          </p>
        </div>
        <Card className="h-fit dark-card">
          <CardContent className="text-center py-12">
            <div className="gradient-primary w-fit mx-auto p-2 mb-4 rounded-md"><GlobeIcon className="stroke-stone-200 size-12" /></div>
            <h3 className="font-bold text-lg text-stone-200 mb-2">
              Global Reach
            </h3>
            <p className="text-stone-500">
              Supporting sourcing from 50+ countries with real-time pricing.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
        <Card className="h-fit dark-card">
          <CardContent className="text-center py-12">
            <div className="gradient-primary w-fit mx-auto p-2 mb-4 rounded-md hover:from"><GemIcon className="stroke-stone-200 size-12" /></div>
            <h3 className="font-bold text-lg text-stone-200">
              Quality First
            </h3>
            <p className="text-stone-400">
              Only verified suppliers with excellent track records.
            </p>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <h2 className="text-3xl font-bold text-stone-800">Our Values</h2>
          <ul className="space-y-4 text-stone-500">
            <li className="flex gap-3">
              <span className="text-2xl bg-stone-100 p-2 rounded-md"><BlendIcon /></span>
              <div>
                <h4 className="font-bold text-stone-800">Transparency</h4>
                <p className="text-sm">Every cost itemized and explained</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="text-2xl bg-stone-100 p-2 rounded-md"><RocketIcon /></span>
              <div>
                <h4 className="font-bold text-stone-800">Speed</h4>
                <p className="text-sm">
                  Instant quotes and rapid order processing
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="text-2xl bg-stone-100 p-2 rounded-md"><ShieldCheckIcon /></span>
              <div>
                <h4 className="font-bold text-stone-800">Security</h4>
                <p className="text-sm">
                  Enterprise-grade protection for your data
                </p>
              </div>
            </li>
          </ul>
        </div>
      </div>

      {/* Team Section */}
      <h2 className="text-3xl font-bold text-center mb-12 text-stone-800">
        Our Team
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
        {[
          {
            name: "Alex Chen",
            role: "Founder & CEO",
            bio: "10+ years in supply chain tech",
            avatar: "👨‍💼",
          },
          {
            name: "Sofia Rodriguez",
            role: "CTO",
            bio: "Ex-Amazon logistics engineer",
            avatar: "👩‍💻",
          },
          {
            name: "James Park",
            role: "Head of Operations",
            bio: "Former Alibaba operations lead",
            avatar: "👨‍💼",
          },
          {
            name: "Emma Thompson",
            role: "Customer Success",
            bio: "Passionate about customer care",
            avatar: "👩‍💼",
          },
        ].map((member) => (
          <Card key={member.name} className="text-center">
            <CardContent className="py-8">
              <div className="text-5xl mb-4">{member.avatar}</div>
              <h3 className="font-bold text-stone-800">{member.name}</h3>
              <p className="text-sm font-semibold bg-gradient-to-r from-rose-500 to-amber-500 bg-clip-text text-transparent mb-2">
                {member.role}
              </p>
              <p className="text-sm text-stone-500">{member.bio}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Story Section */}
      <Card variant="elevated" className="mb-16">
        <CardContent className="py-12 space-y-6">
          <h2 className="text-3xl font-bold text-stone-800">Our Story</h2>
          <p className="text-stone-500 leading-relaxed">
            Tomame was founded in 2023 when our team realized how cumbersome
            global product sourcing had become. Entrepreneurs were wasting hours
            extracting product data, calculating shipping, and managing orders
            across multiple platforms.
          </p>
          <p className="text-stone-500 leading-relaxed">
            We built Tomame to automate all of that. Now, thousands of
            businesses use our platform to source products faster and cheaper
            than ever before.
          </p>
        </CardContent>
      </Card>

      {/* Testimonials */}
      <h2 className="text-3xl font-bold text-center mb-12 text-stone-800">
        What Our Users Say
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          '"Tomame saved us 20 hours per week. The data extraction alone is worth it." - Marcus L.',
          '"Finally, a platform that doesn\'t hide fees. This is exactly what we needed." - Priya S.',
          '"Customer support is incredible. They actually help solve real problems." - David M.',
        ].map((testimonial, i) => (
          <Card key={i} variant="gradient">
            <CardContent className="py-8">
              <p className="text-stone-500 italic">{testimonial}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
