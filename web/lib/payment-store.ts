import type { PaymentStatus } from "@/lib/types";

const KEY = "pace_payment_status";

type PaymentMap = Record<string, PaymentStatus>; // packId → status override

function read(): PaymentMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as PaymentMap;
  } catch {
    return {};
  }
}

export function getPaymentStatus(packId: string, fallback: PaymentStatus): PaymentStatus {
  return read()[packId] ?? fallback;
}

export function setPaymentStatus(packId: string, status: PaymentStatus): void {
  if (typeof window === "undefined") return;
  const map = read();
  map[packId] = status;
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function getAllPaymentOverrides(): PaymentMap {
  return read();
}
