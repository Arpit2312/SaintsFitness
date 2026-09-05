import { notFound } from "next/navigation";
import { getStudent } from "@/lib/queries/students";
import { StudentHeader } from "@/components/students/student-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { getStudentFeeHistory } from "@/lib/queries/fees";
import { StudentFeesTab } from "@/components/students/student-fees-tab";

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="glass-card p-8 text-center text-muted">
      {label} tracking arrives in a future phase of SAINTS.
    </div>
  );
}

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [student, feeHistory] = await Promise.all([getStudent(id), getStudentFeeHistory(id)]);
  if (!student) notFound();

  const enrollment = student.enrollments[0];

  // React Server Components refuse to pass Prisma Decimal instances to a
  // "use client" component ("Only plain objects can be passed to Client
  // Components from Server Components. Decimal objects are not supported."),
  // so feeHistory's Decimal fields (plan.totalAmount/discount/finalAmount,
  // each period's amountDue/amountPaid, totalPaid, totalPending) are
  // converted to plain numbers here, right at the boundary, before
  // StudentFeesTab ever receives them.
  const feeHistoryForClient = feeHistory
    ? {
        plan: {
          totalAmount: feeHistory.plan.totalAmount.toNumber(),
          frequency: feeHistory.plan.frequency,
          dueDate: feeHistory.plan.dueDate,
          discount: feeHistory.plan.discount.toNumber(),
          finalAmount: feeHistory.plan.finalAmount.toNumber(),
        },
        periods: feeHistory.periods.map((period) => ({
          ...period,
          amountDue: period.amountDue.toNumber(),
          amountPaid: period.amountPaid.toNumber(),
        })),
        totalPaid: feeHistory.totalPaid.toNumber(),
        totalPending: feeHistory.totalPending.toNumber(),
        nextCoverageStart: feeHistory.nextCoverageStart,
      }
    : null;

  return (
    <div className="space-y-6">
      <StudentHeader
        id={student.id}
        name={student.name}
        studentCode={student.studentCode}
        photoUrl={student.photoUrl}
        status={student.status}
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="journey">SAINTS Journey</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="glass-card space-y-3 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted">Mobile</p>
              <p className="text-foreground">{student.mobile}</p>
            </div>
            <div>
              <p className="text-sm text-muted">Date of Birth</p>
              <p className="text-foreground">{format(student.dob, "dd MMM yyyy")}</p>
            </div>
            <div>
              <p className="text-sm text-muted">Joining Date</p>
              <p className="text-foreground">{format(student.joiningDate, "dd MMM yyyy")}</p>
            </div>
            <div>
              <p className="text-sm text-muted">Gender</p>
              <p className="text-foreground">{student.gender}</p>
            </div>
            {student.address && (
              <div className="sm:col-span-2">
                <p className="text-sm text-muted">Address</p>
                <p className="text-foreground">
                  {student.address.houseStreet}, {student.address.area}, {student.address.city},{" "}
                  {student.address.state} - {student.address.pinCode}
                </p>
              </div>
            )}
            {student.emergencyContact && (
              <div>
                <p className="text-sm text-muted">Emergency Contact</p>
                <p className="text-foreground">
                  {student.emergencyContact.name} ({student.emergencyContact.relationship}) —{" "}
                  {student.emergencyContact.mobile}
                </p>
              </div>
            )}
            {student.parentDetails && (
              <div>
                <p className="text-sm text-muted">Parent / Guardian</p>
                <p className="text-foreground">
                  {student.parentDetails.fatherName || student.parentDetails.guardianName || "—"}
                  {student.parentDetails.parentMobile ? ` — ${student.parentDetails.parentMobile}` : ""}
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="fees">
          <StudentFeesTab studentId={student.id} feeHistory={feeHistoryForClient} />
        </TabsContent>

        <TabsContent value="attendance">
          <ComingSoon label="Attendance" />
        </TabsContent>

        <TabsContent value="classes" className="glass-card space-y-2 p-6">
          {enrollment ? (
            <div>
              <p className="font-medium text-foreground">{enrollment.batch.name}</p>
              <p className="text-sm text-muted">{enrollment.batch.course.name}</p>
              <p className="text-sm text-muted">{enrollment.batch.timing}</p>
              <p className="text-sm text-muted">
                Instructor: {enrollment.batch.instructor?.name ?? "Unassigned"}
              </p>
              <p className="text-sm text-muted">
                Joined batch on {format(enrollment.joiningBatchDate, "dd MMM yyyy")}
              </p>
            </div>
          ) : (
            <p className="text-muted">Not enrolled in any batch.</p>
          )}
        </TabsContent>

        <TabsContent value="notes">
          <ComingSoon label="Instructor notes" />
        </TabsContent>

        <TabsContent value="journey">
          <ComingSoon label="SAINTS Journey" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
