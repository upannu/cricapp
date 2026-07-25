import { Suspense } from "react";
import { CoachesClient } from "@/components/CoachesClient";

export default function CoachesPage() {
  return (
    <Suspense fallback={null}>
      <CoachesClient />
    </Suspense>
  );
}
