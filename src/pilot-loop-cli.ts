import { emitDemoTrace } from "./phoenix.js";

function parseArgs(argv: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current?.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
    const nextValue = argv[index + 1];
    if (nextValue && !nextValue.startsWith("--")) {
      values[key] = nextValue;
      index += 1;
    } else {
      values[key] = "true";
    }
  }
  return values;
}

const args = parseArgs(process.argv.slice(2));

const outputId = args.outputId;
const runId = args.runId;
const sessionId = args.sessionId ?? runId;

if (!outputId || !runId || !sessionId) {
  console.error("Usage: tsx src/pilot-loop-cli.ts --outputId <id> --runId <id> --sessionId <id>");
  process.exit(1);
}

const result = await emitDemoTrace({ outputId, runId, sessionId });
console.log(JSON.stringify(result));
