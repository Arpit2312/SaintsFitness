import { describe, it, expect } from "vitest";
import { isActiveRoute } from "@/lib/nav";

describe("isActiveRoute", () => {
  it("matches an exact pathname", () => {
    expect(isActiveRoute("/dashboard", "/dashboard")).toBe(true);
  });

  it("matches nested routes under the nav item's base segment", () => {
    expect(isActiveRoute("/classes/courses", "/classes/courses")).toBe(true);
    expect(isActiveRoute("/classes/batches", "/classes/courses")).toBe(true);
  });

  it("does not match a sibling route that merely shares a string prefix", () => {
    expect(isActiveRoute("/students-archive", "/students")).toBe(false);
  });

  it("does not match an unrelated route", () => {
    expect(isActiveRoute("/fees", "/students")).toBe(false);
  });
});
