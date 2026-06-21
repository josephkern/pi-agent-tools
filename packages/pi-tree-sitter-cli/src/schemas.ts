import { Type } from "typebox";

const PathInputs = {
  paths: Type.Optional(
    Type.Array(Type.String(), {
      description: "Source file paths or glob patterns passed to tree-sitter.",
      minItems: 1,
    }),
  ),
  pathsFile: Type.Optional(Type.String({ description: "Path to a file containing source paths." })),
} as const;

const ConfigInputs = {
  configPath: Type.Optional(Type.String({ description: "Path to a Tree-sitter config.json file." })),
  useManagedConfig: Type.Optional(
    Type.Boolean({ description: "Use this package's tool-local Tree-sitter config." }),
  ),
} as const;

const ProcessTimeoutInput = {
  processTimeoutMs: Type.Optional(
    Type.Number({ description: "Wrapper process timeout in milliseconds.", minimum: 1 }),
  ),
} as const;

export const LanguageParams = Type.Object(
  {
    ...ConfigInputs,
    ...ProcessTimeoutInput,
  },
  { additionalProperties: false },
);

export const GrammarStatusParams = Type.Object(
  {
    ...ProcessTimeoutInput,
  },
  { additionalProperties: false },
);

export const GrammarInstallParams = Type.Object(
  {
    packages: Type.Array(Type.String({ description: "npm grammar package spec, e.g. tree-sitter-python." }), {
      description: "Tree-sitter grammar npm package specs to install into the tool-local cache.",
      minItems: 1,
    }),
    allowScripts: Type.Optional(
      Type.Boolean({
        description: "Allow npm lifecycle scripts. Defaults to false, which passes --ignore-scripts.",
      }),
    ),
    ...ProcessTimeoutInput,
  },
  { additionalProperties: false },
);

const CommonCliInputs = {
  ...ConfigInputs,
  scope: Type.Optional(
    Type.String({ description: "Language scope to use when file extension is ambiguous." }),
  ),
  grammarPath: Type.Optional(Type.String({ description: "Path to a Tree-sitter grammar directory." })),
  ...ProcessTimeoutInput,
} as const;

export const ParseParams = Type.Object(
  {
    ...PathInputs,
    mode: Type.Optional(
      Type.String({ description: "Output mode: cst (default), xml, dot, or json-summary." }),
    ),
    ...CommonCliInputs,
    encoding: Type.Optional(
      Type.String({ description: "Input encoding: utf8, utf16-le, or utf16-be." }),
    ),
    timeoutMicros: Type.Optional(
      Type.Number({ description: "Tree-sitter per-file parse timeout in microseconds.", minimum: 1 }),
    ),
    stat: Type.Optional(Type.Boolean({ description: "Show parse statistics." })),
    time: Type.Optional(Type.Boolean({ description: "Measure parse time." })),
    noRanges: Type.Optional(Type.Boolean({ description: "Omit ranges in CST output." })),
  },
  { additionalProperties: false },
);

export const QueryParams = Type.Object(
  {
    query: Type.Optional(Type.String({ description: "Inline Tree-sitter query text." })),
    queryFile: Type.Optional(Type.String({ description: "Path to a .scm Tree-sitter query file." })),
    ...PathInputs,
    ...CommonCliInputs,
    captures: Type.Optional(Type.Boolean({ description: "Order output by captures instead of matches." })),
    compact: Type.Optional(
      Type.Boolean({ description: "Format capture output as compact file:line:column capture text lines." }),
    ),
    time: Type.Optional(Type.Boolean({ description: "Measure query execution time." })),
    byteRange: Type.Optional(
      Type.String({ description: "Byte range to query, formatted as start:end." }),
    ),
    rowRange: Type.Optional(Type.String({ description: "Row range to query, formatted as start:end." })),
    containingByteRange: Type.Optional(
      Type.String({
        description: "Byte range; only matches fully contained in this range are returned.",
      }),
    ),
    containingRowRange: Type.Optional(
      Type.String({
        description: "Row range; only matches fully contained in this range are returned.",
      }),
    ),
  },
  { additionalProperties: false },
);

export const TagsParams = Type.Object(
  {
    ...PathInputs,
    ...CommonCliInputs,
    compact: Type.Optional(
      Type.Boolean({ description: "Format tag output as compact file:line:column kind.role name lines." }),
    ),
    time: Type.Optional(Type.Boolean({ description: "Measure tag generation time." })),
  },
  { additionalProperties: false },
);
