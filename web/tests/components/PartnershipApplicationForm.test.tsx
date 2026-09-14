import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PartnershipApplicationForm } from "@/components/PartnershipApplicationForm";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function fillStep1() {
  fireEvent.change(screen.getByLabelText(/Organisation Name/), { target: { value: "Zenith Cricket Board" } });
  fireEvent.change(screen.getByLabelText(/Organisation Type/), { target: { value: "National Cricket Board" } });
  fireEvent.change(screen.getByLabelText(/^Country/), { target: { value: "Australia" } });
}

function goToContactStep() {
  fillStep1();
  fireEvent.click(screen.getByRole("button", { name: "Continue →" })); // Step 2 Scale
  fireEvent.click(screen.getByRole("button", { name: "Continue →" })); // Step 3 Interests
  fireEvent.click(screen.getByRole("button", { name: "Continue →" })); // Step 4 Requirements
  fireEvent.click(screen.getByRole("button", { name: "Continue →" })); // Step 5 Contact
}

describe("PartnershipApplicationForm", () => {
  beforeEach(() => {
    push.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  test("blocks continuing past step 1 until organisation name, type and country are filled", () => {
    render(<PartnershipApplicationForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue →" }));
    expect(screen.getByText("Organisation name is required.")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 5 — Organisation")).toBeInTheDocument();
  });

  test("advances through all 5 steps once each step's required fields are valid", () => {
    render(<PartnershipApplicationForm />);
    goToContactStep();
    expect(screen.getByText("Step 5 of 5 — Contact")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Partnership Application" })).toBeInTheDocument();
  });

  test("blocks submit until contact name, job title and email are filled", () => {
    render(<PartnershipApplicationForm />);
    goToContactStep();
    fireEvent.click(screen.getByRole("button", { name: "Submit Partnership Application" }));
    expect(screen.getByText("Your name is required.")).toBeInTheDocument();
  });

  test("submits the full draft and navigates to the success page with the returned reference", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, id: "prt_1", reference: "CRIC-BRD-2026-000001" }),
    });

    render(<PartnershipApplicationForm />);
    goToContactStep();

    fireEvent.change(screen.getByLabelText(/First Name/), { target: { value: "Priya" } });
    fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: "Shah" } });
    fireEvent.change(screen.getByLabelText(/Job Title/), { target: { value: "Head of Cricket" } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "priya@zenithcricket.example" } });

    fireEvent.click(screen.getByRole("button", { name: "Submit Partnership Application" }));

    await screen.findByRole("button", { name: "Submitting…" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/partnerships/apply",
      expect.objectContaining({ method: "POST" }),
    );
    const sentBody = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(sentBody).toMatchObject({ organisationName: "Zenith Cricket Board", contactFirstName: "Priya", email: "priya@zenithcricket.example" });

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/partnerships/cricket-board/success?ref=CRIC-BRD-2026-000001"));
  });

  test("shows the API's error message and re-enables submit when the request fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Something went wrong." }),
    });

    render(<PartnershipApplicationForm />);
    goToContactStep();
    fireEvent.change(screen.getByLabelText(/First Name/), { target: { value: "Priya" } });
    fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: "Shah" } });
    fireEvent.change(screen.getByLabelText(/Job Title/), { target: { value: "Head of Cricket" } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "priya@zenithcricket.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit Partnership Application" }));

    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Partnership Application" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
