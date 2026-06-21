; Python module exports.
; Python exports are mostly convention-based; this captures explicit __all__ entries
; plus top-level functions, classes, and simple assigned values.
; Stable capture contract:
;   @export.function - top-level function name
;   @export.class    - top-level class name
;   @export.value    - top-level assigned binding name
;   @export.name     - string member of __all__
;   @export.list     - __all__ binding marker

(module
  (function_definition
    name: (identifier) @export.function))

(module
  (class_definition
    name: (identifier) @export.class))

((module
  (expression_statement
    (assignment
      left: (identifier) @export.value)))
  (#not-eq? @export.value "__all__"))

((module
  (expression_statement
    (assignment
      left: (identifier) @export.list
      right: (list))))
  (#eq? @export.list "__all__"))

((module
  (expression_statement
    (assignment
      left: (identifier) @export.list
      right: (list
        (string
          (string_content) @export.name)))))
  (#eq? @export.list "__all__"))
