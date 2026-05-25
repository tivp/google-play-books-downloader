import { expect, test, describe, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import { getCookieHeader } from "../src/utils/cookie";

const TEMP_COOKIE_FILE = path.join(__dirname, "temp_cookies_test.txt");

describe("cookie utility", () => {
  afterEach(() => {
    if (fs.existsSync(TEMP_COOKIE_FILE)) {
      fs.unlinkSync(TEMP_COOKIE_FILE);
    }
  });

  test("throws if file does not exist", () => {
    expect(() => getCookieHeader("nonexistent_file.txt")).toThrow(/Cookies file not found/);
  });

  test("throws if no valid cookies are found", () => {
    fs.writeFileSync(TEMP_COOKIE_FILE, "# Netscape HTTP Cookie File\n");
    expect(() => getCookieHeader(TEMP_COOKIE_FILE)).toThrow(/No valid cookies found/);
  });

  test("successfully parses valid Netscape cookies", () => {
    const data = [
      "# Netscape HTTP Cookie File",
      ".google.com\tTRUE\t/\tTRUE\t2147483647\tSID\tmy_sid_value",
      ".google.com\tTRUE\t/\tTRUE\t2147483647\tHSID\tmy_hsid_value",
      "invalid_line_without_tabs",
      ".google.com\tTRUE\t/\tTRUE\t2147483647\tBAD_CHAR\tvalue_with_\xff_bad_char"
    ].join("\n");

    fs.writeFileSync(TEMP_COOKIE_FILE, data);

    const header = getCookieHeader(TEMP_COOKIE_FILE);
    expect(header).toBe("SID=my_sid_value; HSID=my_hsid_value");
  });
});
