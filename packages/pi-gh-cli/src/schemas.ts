import { Type } from "typebox";

export const GhCliParams = Type.Object(
  {
    args: Type.Array(Type.String({ description: "GitHub CLI argument, excluding the leading `gh`." }), {
      description: "Arguments passed directly to gh, e.g. ['issue', 'list', '--repo', 'owner/repo', '--json', 'number,title'].",
      minItems: 1,
    }),
    processTimeoutMs: Type.Optional(
      Type.Number({ description: "Wrapper process timeout in milliseconds.", minimum: 1 }),
    ),
  },
  { additionalProperties: false },
);
