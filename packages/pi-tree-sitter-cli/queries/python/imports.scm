; Python import declarations.
; Stable capture contract:
;   @import.source - imported module or from-module
;   @import.name   - imported name in a from-import clause
;   @import.alias  - alias, when present
;   @import.star   - wildcard import marker, when present

(import_statement
  name: (dotted_name) @import.source)

(import_statement
  name: (aliased_import
    name: (dotted_name) @import.source
    alias: (identifier) @import.alias))

(import_from_statement
  module_name: [(dotted_name) (relative_import)] @import.source
  name: (dotted_name) @import.name)

(import_from_statement
  module_name: [(dotted_name) (relative_import)] @import.source
  name: (aliased_import
    name: (dotted_name) @import.name
    alias: (identifier) @import.alias))

(import_from_statement
  module_name: [(dotted_name) (relative_import)] @import.source
  (wildcard_import) @import.star)
