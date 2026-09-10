import { Suspense } from "react";
import { SessionPacksClient } from "@/components/SessionPacksClient";

export default function SessionPacksPage() {
  return (
    <Suspense fallback={null}>
      <SessionPacksClient />
    </Suspense>
  );
}
