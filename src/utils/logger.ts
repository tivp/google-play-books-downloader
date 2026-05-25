import chalk from "chalk";

/**
 * Professional CLI logger with chalk coloring.
 */
export const logger = {
  showDebug: false,
  timestamp: () =>
    chalk.gray(`${new Date().toLocaleTimeString([], { hour12: false })}`),

  info: (msg: string) => console.log(chalk.cyan.bold("ℹ ") + msg),
  success: (msg: string) => console.log(chalk.green.bold("✔ ") + msg),
  warn: (msg: string) => console.log(chalk.yellow.bold("⚠ ") + msg),
  error: (msg: string) => console.log(chalk.red.bold("✖ ") + msg),
  debug: (msg: string) => {
    if (logger.showDebug) {
      console.log(
        `${logger.timestamp()} ${chalk.magenta.bold("DEBUG")} ${msg}`,
      );
    }
  },
  step: (msg: string) => console.log(chalk.magenta.bold("➔ ") + msg),
  progress: (current: number, total: number, prefix: string) => {
    if (logger.showDebug) {
      logger.info(`[${current}/${total}] ${prefix}`);
    } else {
      const pct = Math.round((current / total) * 100);
      process.stdout.write(`\r\x1b[K${chalk.cyan.bold("ℹ")} ${prefix}: ${current}/${total} (${pct}%)`);
    }
  },
  clearProgress: () => {
    if (!logger.showDebug) {
      process.stdout.write("\n");
    }
  },
};
