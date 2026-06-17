; TypeScript/TSX import declarations.

(import_statement
  source: (string) @import.source) @import.statement

(import_statement
  (import_clause (identifier) @import.default))

(namespace_import
  (identifier) @import.namespace)

(import_specifier
  name: (identifier) @import.name
  alias: (identifier)? @import.alias)
