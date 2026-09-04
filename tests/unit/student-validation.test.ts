import { describe, it, expect } from "vitest";
import { studentSchema } from "@/lib/validations/student";

const validInput = {
  name: "Rahul Sharma",
  mobile: "9876543210",
  dob: "2005-06-15",
  gender: "MALE" as const,
  joiningDate: "2026-01-10",
  status: "ACTIVE" as const,
  batchId: "some-batch-id",
  houseStreet: "12 MG Road",
  area: "Andheri",
  city: "Mumbai",
  state: "Maharashtra",
  pinCode: "400058",
  emergencyContactName: "Sunita Sharma",
  emergencyContactRelationship: "Mother",
  emergencyContactMobile: "9876500000",
  fatherName: "Ramesh Sharma",
  motherName: "Sunita Sharma",
  guardianName: "",
  parentMobile: "9876500000",
};

describe("studentSchema", () => {
  it("accepts a fully valid student", () => {
    const result = studentSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid mobile number", () => {
    const result = studentSchema.safeParse({ ...validInput, mobile: "12345" });
    expect(result.success).toBe(false);
  });

  it("rejects a PIN code that isn't 6 digits", () => {
    const result = studentSchema.safeParse({ ...validInput, pinCode: "4005" });
    expect(result.success).toBe(false);
  });

  it("rejects a date of birth in the future", () => {
    const result = studentSchema.safeParse({ ...validInput, dob: "2099-01-01" });
    expect(result.success).toBe(false);
  });

  it("requires a batch to be selected", () => {
    const result = studentSchema.safeParse({ ...validInput, batchId: "" });
    expect(result.success).toBe(false);
  });
});
