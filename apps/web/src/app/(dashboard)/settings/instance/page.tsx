import type { Metadata } from "next";
import { PageHeader } from "@dashboard/page-header";
import { resolvePublicAppUrl } from "@/lib/public-app-url";
import { PublicUrlCard } from "./_components/public-url-card";
import { BuildVersionCard } from "./_components/build-version-card";

export const metadata: Metadata = {
  title: "Instance",
};

export default async function InstancePage() {
  const { appUrl, autoDetected } = await resolvePublicAppUrl();

  return (
    <div className="flex flex-1 flex-col gap-4">
      <PageHeader
        title="Instance"
        description="Instance configuration for your self-hosted deployment."
      />
      <PublicUrlCard appUrl={appUrl} autoDetected={autoDetected} />
      <BuildVersionCard />
    </div>
  );
}
