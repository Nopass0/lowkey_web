import { LandingPageClient } from "@/components/landing-page-client";
import {
  fallbackPlans,
  fetchPublicPlans,
  getLowestDisplayedPlanPrice,
} from "@/lib/public-plans";

export const revalidate = 60; // cache for 60s, refresh in background

export default async function Page() {
  const plans = await fetchPublicPlans().catch(() => fallbackPlans);
  const lowestPrice = getLowestDisplayedPlanPrice(plans);

  return <LandingPageClient initialPlans={plans} lowestPrice={lowestPrice} />;
}
