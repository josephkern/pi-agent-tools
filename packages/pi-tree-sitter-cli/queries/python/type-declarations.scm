; Python class and type alias declarations.
; Stable capture contract:
;   @type.class - class name
;   @type.alias - PEP 695 type alias name

(class_definition
  name: (identifier) @type.class)

(type_alias_statement
  left: (type
    (identifier) @type.alias))
