import { Suspense } from "react";
import { isAuthEnabled } from "@/lib/auth-config";
import Dashboard from "./dashboard";

export default async function Home() {
  const authEnabled = await isAuthEnabled();
  return (
    <Suspense>
      <Dashboard authEnabled={authEnabled} />
    </Suspense>
  );
}
