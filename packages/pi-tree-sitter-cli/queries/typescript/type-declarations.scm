; TypeScript/TSX class, interface, type alias, and enum declarations.
; Stable capture contract:
;   @type.class     - class name
;   @type.interface - interface name
;   @type.alias     - type alias name
;   @type.enum      - enum name

(class_declaration
  name: (type_identifier) @type.class)

(interface_declaration
  name: (type_identifier) @type.interface)

(type_alias_declaration
  name: (type_identifier) @type.alias)

(enum_declaration
  name: (identifier) @type.enum)
