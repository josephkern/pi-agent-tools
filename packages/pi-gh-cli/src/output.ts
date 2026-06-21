import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import type { GhRunResult } from "./types.ts";

export { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize };

export type ToolTruncation = ReturnType<typeof truncateHead>;

export function stripAnsi(text: string): string {
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

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

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=+@-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function formatInvocation(command: string, args: string[]): string {
  return [command, ...args].map(shellQuote).join(" ");
}

export function formatResultText(
  title: string,
  result: GhRunResult,
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
