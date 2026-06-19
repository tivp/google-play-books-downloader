import { describe, it, expect, afterAll, beforeAll } from "bun:test";
import fs from "fs";
import path from "path";
import { getLanguage } from "../src/utils/config";

const CONFIG_PATH = path.resolve("./config.txt");

describe("config utility", () => {
  let backupContent: string | null = null;

  beforeAll(() => {
    if (fs.existsSync(CONFIG_PATH)) {
      backupContent = fs.readFileSync(CONFIG_PATH, "utf-8");
    }
  });

  afterAll(() => {
    if (backupContent !== null) {
      fs.writeFileSync(CONFIG_PATH, backupContent, "utf-8");
    } else if (fs.existsSync(CONFIG_PATH)) {
      fs.unlinkSync(CONFIG_PATH);
    }
  });

  it("creates config.txt with Language=EN if it does not exist", () => {
    if (fs.existsSync(CONFIG_PATH)) {
      fs.unlinkSync(CONFIG_PATH);
    }
    const lang = getLanguage();
    expect(lang).toBe("EN");
    expect(fs.existsSync(CONFIG_PATH)).toBe(true);
    const content = fs.readFileSync(CONFIG_PATH, "utf-8");
    expect(content).toContain("Language=EN");
  });

  it("reads Language=ES case-insensitively", () => {
    fs.writeFileSync(CONFIG_PATH, "language=es\n", "utf-8");
    const lang = getLanguage();
    expect(lang).toBe("ES");
  });

  it("reads lenguaje=ES case-insensitively for backwards compatibility", () => {
    fs.writeFileSync(CONFIG_PATH, "lenguaje=ES\n", "utf-8");
    const lang = getLanguage();
    expect(lang).toBe("ES");
  });

  it("defaults to EN on invalid value", () => {
    fs.writeFileSync(CONFIG_PATH, "Language=FR\n", "utf-8");
    const lang = getLanguage();
    expect(lang).toBe("EN");
  });
});
