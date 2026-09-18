"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export type AttendanceTrendPoint = { label: string; rate: number | null };

export function AttendanceTrendChart({ data }: { data: AttendanceTrendPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickFormatter={(value: number) => `${value}%`}
          />
          <Tooltip
            contentStyle={{ backgroundColor: "var(--popover)", border: "1px solid var(--card-border)", borderRadius: 8 }}
            labelStyle={{ color: "var(--muted-foreground)" }}
            formatter={(value) => [value == null ? "No data" : `${Number(value)}%`, "Attendance Rate"]}
          />
          <Line type="monotone" dataKey="rate" stroke="var(--gold)" strokeWidth={2} dot={data.length < 2} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
