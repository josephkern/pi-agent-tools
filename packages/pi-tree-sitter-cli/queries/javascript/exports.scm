; JavaScript/JSX exported declarations, export lists, and re-exports.
; Uses node shapes shared by tree-sitter-javascript and the TypeScript-family
; grammars often configured to parse .js files; the class-name wildcard covers
; the grammars' differing name node types.
; Stable capture contract:
;   @export.function  - exported function name
;   @export.class     - exported class name
;   @export.value     - exported const/let/var binding name
;   @export.name      - name in an export clause
;   @export.alias     - alias in an export clause, when present
;   @export.source    - source module of a re-export (`export ... from "mod"`)
;   @export.namespace - namespace alias in `export * as ns from "mod"`
;   @export.default   - default-exported expression

(export_statement
  declaration: (function_declaration
    name: (identifier) @export.function))

(export_statement
  declaration: (generator_function_declaration
    name: (identifier) @export.function))

(export_statement
  declaration: (class_declaration
    name: (_) @export.class))

(export_statement
  declaration: (lexical_declaration
    (variable_declarator
      name: (identifier) @export.value)))

(export_statement
  declaration: (variable_declaration
    (variable_declarator
      name: (identifier) @export.value)))

(export_statement
  (export_clause
    (export_specifier
      name: (identifier) @export.name
      alias: (identifier)? @export.alias)))

; Re-exports: `export * from "mod"` and `export { x } from "mod"`.
(export_statement
  source: (string) @export.source)

(export_statement
  (namespace_export
    (identifier) @export.namespace))

; Default-exported expressions, e.g. `export default someValue;`.
; Named `export default function/class` declarations are captured above.
(export_statement
  value: (_) @export.default)
