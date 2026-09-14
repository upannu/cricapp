import { describe, expect, test, vi, afterEach } from "vitest";
import { POST } from "@/app/api/partnerships/apply/route";
import { routeMockState } from "../../setup/api";
import { jsonRequest } from "../../mocks/caller";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn(async (_opts: Record<string, unknown>) => ({})) }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

const URL = "http://localhost/api/partnerships/apply";

const VALID_APPLICATION = {
  organisationName: "Zenith Cricket Board",
  organisationType: "National Cricket Board",
  country: "Australia",
  region: "Victoria",
  contactFirstName: "Priya",
  contactLastName: "Shah",
  jobTitle: "Head of Cricket",
  email: "priya@zenithcricket.example",
};

describe("POST /api/partnerships/apply", () => {
  afterEach(() => {
    sendMail.mockClear();
  });

  test("400 when a required field is missing", async () => {
    const { organisationName: _organisationName, ...withoutOrgName } = VALID_APPLICATION;
    const res = await POST(jsonRequest(URL, withoutOrgName));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/organisationName/);
  });

  test("400 for an invalid organisation type", async () => {
    const res = await POST(jsonRequest(URL, { ...VALID_APPLICATION, organisationType: "Backyard XI" }));
    expect(res.status).toBe(400);
  });

  test("saves the application, logs a submitted activity entry, and emails the platform admin", async () => {
    routeMockState.tableResponses = {
      partnership_applications: { data: null, error: null },
      partnership_activity: { data: null, error: null },
    };

    const res = await POST(jsonRequest(URL, VALID_APPLICATION));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.reference).toMatch(/^CRIC-BRD-\d{4}-\d{6}$/);

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.partnership_applications.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organisation_name: "Zenith Cricket Board",
        organisation_type: "National Cricket Board",
        country: "Australia",
        region: "Victoria",
        status: "submitted",
      }),
    );
    expect(client.tables.partnership_activity.insert).toHaveBeenCalledWith(
      expect.objectContaining({ application_id: body.id, kind: "submitted" }),
    );

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({
      to: process.env.PLATFORM_ADMIN_EMAIL,
      replyTo: VALID_APPLICATION.email,
      subject: expect.stringContaining("Zenith Cricket Board"),
    });
  });

  test("500 when the insert fails, and no notification is sent", async () => {
    routeMockState.tableResponses = {
      partnership_applications: { data: null, error: { message: "insert failed" } },
    };

    const res = await POST(jsonRequest(URL, VALID_APPLICATION));

    expect(res.status).toBe(500);
    expect(sendMail).not.toHaveBeenCalled();
  });

  test("still saves the application even when the notification email fails", async () => {
    sendMail.mockRejectedValueOnce(new Error("smtp down"));
    routeMockState.tableResponses = {
      partnership_applications: { data: null, error: null },
      partnership_activity: { data: null, error: null },
    };

    const res = await POST(jsonRequest(URL, VALID_APPLICATION));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
