import { notFound } from "next/navigation";
import { fetchPlayerServer, canAccessPlayerServer } from "@/lib/supabase-server";
import { NewSessionForm } from "@/components/NewSessionForm";
import type { BookingStatus } from "@/lib/types";

export default async function NewSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ bookingId?: string; coachId?: string; time?: string; durationMins?: string; status?: string }>;
}) {
  const { id } = await params;
  const { bookingId, coachId, time, durationMins, status } = await searchParams;
  const player = await fetchPlayerServer(id);
  if (!player || !(await canAccessPlayerServer(id))) notFound();

  return (
    <NewSessionForm
      player={player}
      bookingId={bookingId}
      bookingCoachId={coachId}
      bookingTime={time}
      bookingDurationMins={durationMins ? Number(durationMins) : undefined}
      bookingStatus={status as BookingStatus | undefined}
    />
  );
}
