import { describe, expect, test } from "bun:test";
import { resolveRegistrySpec } from "./registry-spec";

describe("resolveRegistrySpec", () => {
  test("keeps the declared name for a plain range", () => {
    expect(resolveRegistrySpec("@vercel/ncc", "^0.44.1")).toEqual({
      registryName: "@vercel/ncc",
      range: "^0.44.1",
    });
  });

  test("follows an alias to a scoped package", () => {
    expect(
      resolveRegistrySpec("typescript", "npm:@typescript/typescript6@^6.0.2"),
    ).toEqual({ registryName: "@typescript/typescript6", range: "^6.0.2" });
  });

  test("follows an alias to an unscoped package", () => {
    expect(
      resolveRegistrySpec("@typescript/native", "npm:typescript@^7.0.2"),
    ).toEqual({ registryName: "typescript", range: "^7.0.2" });
  });

  test("leaves an alias without a range untouched", () => {
    expect(resolveRegistrySpec("typescript", "npm:typescript")).toEqual({
      registryName: "typescript",
      range: "npm:typescript",
    });
  });
});
