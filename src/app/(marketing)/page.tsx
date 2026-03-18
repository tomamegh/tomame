import { LandingPageBlogSection, LandingPageCTASection, LandingPageFAQSection, LandingPageFeaturesSection, LandingPageHeroSection, LandingPageProcessSteps, LandingPageTestimonialsSection, LandingPageValueSection } from '@/components/landing';
import { getGhsRate } from '@/lib/exchange-rates/service';
import { DEFAULT_FX_BUFFER_PCT, FALLBACK_FX_RATE } from '@/config/pricing';

export const revalidate = 14400; // 4 hours

export default async function HomePage() {
  const midMarketRate = await getGhsRate('USD');
  const usdToGhs = midMarketRate
    ? midMarketRate * (1 + DEFAULT_FX_BUFFER_PCT)
    : FALLBACK_FX_RATE;

  return (
    <>
      <LandingPageHeroSection usdToGhs={usdToGhs} />
      <LandingPageFeaturesSection />
      <LandingPageProcessSteps />
      <LandingPageValueSection /> 
      <LandingPageTestimonialsSection />
      <LandingPageBlogSection />
      <LandingPageFAQSection />
      <LandingPageCTASection />
    </>
  );
}
