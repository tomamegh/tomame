
import { LandingPageBlogSection, LandingPageCTASection, LandingPageFAQSection, LandingPageFeaturesSection, LandingPageHeroSection, LandingPageProcessSteps, LandingPageTestimonialsSection, LandingPageValueSection } from '@/components/landing';


export default function HomePage() {
  return (
    <>
      <LandingPageHeroSection />
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
