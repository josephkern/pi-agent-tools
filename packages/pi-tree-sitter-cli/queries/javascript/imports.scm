; JavaScript/JSX import declarations.
; Uses node shapes shared by tree-sitter-javascript and the TypeScript-family
; grammars often configured to parse .js files.
; Stable capture contract:
;   @import.statement - whole import statement
;   @import.source    - imported module string
;   @import.default   - default import binding
;   @import.namespace - namespace import binding
;   @import.name      - named import
;   @import.alias     - alias, when present

(import_statement
  source: (string) @import.source) @import.statement

(import_statement
  (import_clause (identifier) @import.default))

(namespace_import
  (identifier) @import.namespace)

(import_specifier
  name: (identifier) @import.name
  alias: (identifier)? @import.alias)
