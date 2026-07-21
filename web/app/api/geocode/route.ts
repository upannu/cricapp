import { NextResponse } from "next/server";

/** Thin wrapper around the Google Geocoding API. Non-fatal by design — callers should save the
 * rest of the record even if this fails (no API key configured, address not found, etc.). */
export async function POST(request: Request) {
  const { address } = (await request.json()) as { address?: string };
  if (!address?.trim()) {
    return NextResponse.json({ error: "address is required." }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Geocoding is not configured." }, { status: 500 });
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== "OK" || !data.results?.[0]) {
    return NextResponse.json({ error: `Could not resolve that location (${data.status}).` }, { status: 404 });
  }

  const { lat, lng } = data.results[0].geometry.location;
  return NextResponse.json({ lat, lng, formattedAddress: data.results[0].formatted_address });
}
