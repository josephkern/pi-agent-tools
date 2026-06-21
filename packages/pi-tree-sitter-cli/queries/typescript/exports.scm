; TypeScript/TSX exported declarations and export lists.
; Stable capture contract:
;   @export.function  - exported function name
;   @export.class     - exported class name
;   @export.interface - exported interface name
;   @export.type      - exported type alias name
;   @export.value     - exported const/let/var binding name
;   @export.name      - name in an export clause
;   @export.alias     - alias in an export clause, when present

(export_statement
  declaration: (function_declaration
    name: (identifier) @export.function))

(export_statement
  declaration: (class_declaration
    name: (type_identifier) @export.class))

(export_statement
  declaration: (interface_declaration
    name: (type_identifier) @export.interface))

(export_statement
  declaration: (type_alias_declaration
    name: (type_identifier) @export.type))

(export_statement
  declaration: (lexical_declaration
    (variable_declarator
      name: (identifier) @export.value)))

(export_statement
  (export_clause
    (export_specifier
      name: (identifier) @export.name
      alias: (identifier)? @export.alias)))
