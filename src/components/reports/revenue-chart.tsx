"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export type RevenuePoint = { label: string; total: number };

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
          <YAxis
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickFormatter={(value: number) => `₹${value.toLocaleString("en-IN")}`}
          />
          <Tooltip
            contentStyle={{ backgroundColor: "var(--popover)", border: "1px solid var(--card-border)", borderRadius: 8 }}
            labelStyle={{ color: "var(--muted-foreground)" }}
            formatter={(value) => [`₹${Number(value ?? 0).toLocaleString("en-IN")}`, "Revenue"]}
          />
          <Line type="monotone" dataKey="total" stroke="var(--gold)" strokeWidth={2} dot={data.length < 2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
