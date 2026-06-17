export interface TreeSitterRunOptions {
  processTimeoutMs?: number;
  throwOnNonZero?: boolean;
}

export interface TreeSitterRunResult {
  command: string;
  args: string[];
  output: string;
  code: number;
}
