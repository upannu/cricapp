import { Suspense } from "react";
import { AcademyClient } from "@/components/AcademyClient";

export default function AcademyPage() {
  return (
    <Suspense fallback={null}>
      <AcademyClient />
    </Suspense>
  );
}
