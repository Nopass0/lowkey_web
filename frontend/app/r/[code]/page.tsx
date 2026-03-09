import { redirect } from "next/navigation";

interface ReferralRedirectPageProps {
  params: Promise<{
    code: string;
  }>;
}

export default async function ReferralRedirectPage({
  params,
}: ReferralRedirectPageProps) {
  const { code } = await params;

  redirect(`/?ref=${encodeURIComponent(code)}&auth=register`);
}
