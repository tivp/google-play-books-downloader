/**
 * Pre-processes process.argv to handle positional arguments (like book IDs)
 * that start with a hyphen (e.g. -q5VEAAAQBAJ).
 * 
 * It identifies known options and separates them from positional arguments.
 * Any argument that is not a known option or option value is treated as a
 * positional argument and moved after a '--' separator.
 */
export function preProcessArgs(rawArgs: string[]): string[] {
  if (rawArgs.length <= 2) {
    return rawArgs;
  }

  const header = rawArgs.slice(0, 2); // Typically ['node', 'script.js']
  const argv = rawArgs.slice(2);
  const newArgv: string[] = [];
  const positionalArgs: string[] = [];

  // Known options that take a value:
  const valOptions = new Set([
    '--format', '-f',
    '--cookies', '-c',
    '--output', '-o',
    '--temp', '-t',
    '--pace', '-p'
  ]);

  // Known options that do not take a value (boolean flags, help, version):
  const boolOptions = new Set([
    '--verbose', '-v',
    '--help', '-h',
    '--version'
  ]);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--') {
      positionalArgs.push(...argv.slice(i + 1));
      break;
    }

    // Check if it's a known option with '=' (e.g. --format=pdf)
    let isEqualsOption = false;
    for (const valOpt of valOptions) {
      if (arg.startsWith(valOpt + '=')) {
        newArgv.push(arg);
        isEqualsOption = true;
        break;
      }
    }
    if (isEqualsOption) {
      continue;
    }

    // Check if it's a known option taking a value
    if (valOptions.has(arg)) {
      newArgv.push(arg);
      if (i + 1 < argv.length) {
        newArgv.push(argv[i + 1]);
        i++;
      }
      continue;
    }

    // Check if it's a known boolean flag
    if (boolOptions.has(arg)) {
      newArgv.push(arg);
      continue;
    }

    // Otherwise, treat as positional
    positionalArgs.push(arg);
  }

  const finalArgv = [...header, ...newArgv];
  if (positionalArgs.length > 0) {
    finalArgv.push('--', ...positionalArgs);
  }
  return finalArgv;
}
