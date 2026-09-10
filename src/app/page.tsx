import { getDashboard } from "@/lib/dashboard";
import Dashboard from "@/components/dashboard";
import { Suspense } from "react";
export const dynamic = "force-dynamic";
export default async function Page() {
  return (
    <Suspense>
      <Dashboard data={await getDashboard()} />
    </Suspense>
  );
}
