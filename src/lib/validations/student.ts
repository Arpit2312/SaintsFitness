import { z } from "zod";

const mobileRegex = /^[6-9]\d{9}$/;

export const studentSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  mobile: z.string().regex(mobileRegex, "Enter a valid 10-digit Indian mobile number"),
  dob: z.coerce.date().refine((d) => d < new Date(), "Date of birth must be in the past"),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  joiningDate: z.coerce.date(),
  status: z.enum(["ACTIVE", "INACTIVE", "LEFT"]).default("ACTIVE"),
  batchId: z.string().min(1, "Batch is required"),

  houseStreet: z.string().min(1, "Required"),
  area: z.string().min(1, "Required"),
  city: z.string().min(1, "Required"),
  state: z.string().min(1, "Required"),
  pinCode: z.string().regex(/^\d{6}$/, "PIN code must be 6 digits"),

  emergencyContactName: z.string().min(1, "Required"),
  emergencyContactRelationship: z.string().min(1, "Required"),
  emergencyContactMobile: z.string().regex(mobileRegex, "Enter a valid 10-digit mobile number"),

  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  guardianName: z.string().optional(),
  parentMobile: z.string().regex(mobileRegex).optional().or(z.literal("")),
});

export type StudentInput = z.infer<typeof studentSchema>;
