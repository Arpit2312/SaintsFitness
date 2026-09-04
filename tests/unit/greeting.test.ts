import { describe, it, expect } from "vitest";
import { greeting } from "@/components/layout/header";

describe("greeting", () => {
  it("returns Good Morning for early hours", () => {
    expect(greeting(6)).toBe("Good Morning");
  });

  it("returns Good Morning right up to the noon boundary", () => {
    expect(greeting(11)).toBe("Good Morning");
  });

  it("returns Good Afternoon starting at noon", () => {
    expect(greeting(12)).toBe("Good Afternoon");
  });

  it("returns Good Afternoon right up to the evening boundary", () => {
    expect(greeting(16)).toBe("Good Afternoon");
  });

  it("returns Good Evening starting at 17", () => {
    expect(greeting(17)).toBe("Good Evening");
  });

  it("returns Good Evening for late hours", () => {
    expect(greeting(23)).toBe("Good Evening");
  });
});
