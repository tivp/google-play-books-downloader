import fs from "fs";
import path from "path";

const CONFIG_PATH = path.resolve("./config.txt");

export function getLanguage(): 'ES' | 'EN' {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      fs.writeFileSync(CONFIG_PATH, "Language=EN\n", "utf-8");
      return 'EN';
    }
    const content = fs.readFileSync(CONFIG_PATH, "utf-8");
    const match = content.match(/(?:Language|lenguaje)=(ES|EN)/i);
    return match ? (match[1].toUpperCase() as 'ES' | 'EN') : 'EN';
  } catch {
    return 'EN';
  }
}

export const LANGUAGE = getLanguage();

