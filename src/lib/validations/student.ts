import { z } from "zod";

const mobileRegex = /^[6-9]\d{9}$/;

export const studentSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  mobile: z.string().regex(mobileRegex, "Enter a valid 10-digit Indian mobile number"),
  dob: z.coerce.date().refine((d) => d < new Date(), "Date of birth must be in the past"),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  joiningDate: z.coerce.date(),
  // No `.default()` here: zodResolver types its Resolver against zod's
  // *input* type, while `StudentInput` (z.infer) is the *output* type — a
  // schema-level default makes status optional on input but required on
  // output, so useForm<StudentInput>({ resolver: zodResolver(studentSchema) })
  // fails to type-check. The form's defaultValues already supplies "ACTIVE",
  // so the schema-level default was redundant.
  status: z.enum(["ACTIVE", "INACTIVE", "LEFT"]),
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
