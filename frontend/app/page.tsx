import { LandingPageClient } from "@/components/landing-page-client";
import { fallbackPlans, getLowestDisplayedPlanPrice } from "@/lib/public-plans";

export default function Page() {
  return (
    <LandingPageClient
      initialPlans={fallbackPlans}
      lowestPrice={getLowestDisplayedPlanPrice(fallbackPlans)}
    />
  );
}
