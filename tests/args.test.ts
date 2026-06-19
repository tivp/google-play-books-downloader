import { expect, test, describe } from "bun:test";
import { preProcessArgs } from "../src/utils/args";

describe("preProcessArgs", () => {
  test("returns same args when length is <= 2", () => {
    const raw = ["bun", "src/cli.ts"];
    expect(preProcessArgs(raw)).toEqual(raw);
  });

  test("places a hyphen-led book ID after '--' at the end", () => {
    const raw = ["bun", "src/cli.ts", "-q5VEAAAQBAJ", "--format", "pdf"];
    const expected = ["bun", "src/cli.ts", "--format", "pdf", "--", "-q5VEAAAQBAJ"];
    expect(preProcessArgs(raw)).toEqual(expected);
  });

  test("handles normal book ID without hyphen", () => {
    const raw = ["bun", "src/cli.ts", "q5VEAAAQBAJ", "--format", "pdf"];
    const expected = ["bun", "src/cli.ts", "--format", "pdf", "--", "q5VEAAAQBAJ"];
    expect(preProcessArgs(raw)).toEqual(expected);
  });

  test("preserves existing '--' separator and appends extra positional args", () => {
    const raw = ["bun", "src/cli.ts", "--format", "pdf", "--", "-q5VEAAAQBAJ"];
    const expected = ["bun", "src/cli.ts", "--format", "pdf", "--", "-q5VEAAAQBAJ"];
    expect(preProcessArgs(raw)).toEqual(expected);
  });

  test("handles options with '=' character", () => {
    const raw = ["bun", "src/cli.ts", "-q5VEAAAQBAJ", "--format=pdf"];
    const expected = ["bun", "src/cli.ts", "--format=pdf", "--", "-q5VEAAAQBAJ"];
    expect(preProcessArgs(raw)).toEqual(expected);
  });

  test("handles boolean flags like --verbose", () => {
    const raw = ["bun", "src/cli.ts", "--verbose", "-q5VEAAAQBAJ"];
    const expected = ["bun", "src/cli.ts", "--verbose", "--", "-q5VEAAAQBAJ"];
    expect(preProcessArgs(raw)).toEqual(expected);
  });
});
