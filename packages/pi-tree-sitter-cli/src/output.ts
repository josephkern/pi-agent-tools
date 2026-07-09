import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import { MAX_OUTPUT_BUFFER_BYTES } from "./constants.ts";
import type { TreeSitterRunResult } from "./types.ts";

export { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize };

export type ToolTruncation = ReturnType<typeof truncateHead>;

export function truncateToolOutput(text: string): ToolTruncation {
  return truncateHead(text, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });
}

export function truncationNotice(truncation: ToolTruncation): string {
  if (!truncation.truncated) return "";
  const omittedLines = truncation.totalLines - truncation.outputLines;
  const omittedBytes = truncation.totalBytes - truncation.outputBytes;
  return `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(
    truncation.outputBytes,
  )} of ${formatSize(truncation.totalBytes)}). Omitted ${omittedLines} lines (${formatSize(
    omittedBytes,
  )}).]`;
}

export function outputCappedNotice(result: TreeSitterRunResult): string {
  if (!result.outputCapped) return "";
  return `\n\n[Raw output exceeded ${formatSize(
    MAX_OUTPUT_BUFFER_BYTES,
  )}; the process was terminated and remaining output was discarded. Results above are INCOMPLETE — narrow the request (fewer paths, a row range, or a more specific query) and retry.]`;
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=+@-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function formatInvocation(command: string, args: string[]): string {
  return [command, ...args].map(shellQuote).join(" ");
}

export function formatResultText(
  title: string,
  result: TreeSitterRunResult,
  body: string,
  truncation: ToolTruncation,
  exitNotice = "",
): string {
  return [
    `## ${title}`,
    "",
    `Command: \`${formatInvocation(result.command, result.args)}\``,
    `Exit code: ${result.code}`,
    "",
    `${body}${truncationNotice(truncation)}${exitNotice}`,
  ].join("\n");
}
