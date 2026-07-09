; JavaScript/JSX function-like signatures, including arrow functions and
; function expressions bound to variables or class fields.
; Written against node shapes shared by tree-sitter-javascript and the
; TypeScript-family grammars often configured to parse .js files; where the
; grammars diverge (class fields), both spellings are provided.
; Stable capture contract:
;   @signature.name   - function/method name
;   @signature.params - parameter list

(function_declaration
  name: (identifier) @signature.name
  parameters: (formal_parameters) @signature.params)

(generator_function_declaration
  name: (identifier) @signature.name
  parameters: (formal_parameters) @signature.params)

(method_definition
  name: (property_identifier) @signature.name
  parameters: (formal_parameters) @signature.params)

(variable_declarator
  name: (identifier) @signature.name
  value: (arrow_function
    parameters: (formal_parameters) @signature.params))

; Bare single-parameter arrow functions: `const f = x => ...`
(variable_declarator
  name: (identifier) @signature.name
  value: (arrow_function
    parameter: (identifier) @signature.params))

(variable_declarator
  name: (identifier) @signature.name
  value: (function_expression
    parameters: (formal_parameters) @signature.params))

; Class fields holding arrow functions. The field node and its name field
; differ between grammars (field_definition property: vs
; public_field_definition name:), so match any class-body node by fields.
(class_body
  (_
    name: (property_identifier) @signature.name
    value: (arrow_function
      parameters: (formal_parameters) @signature.params)))

(class_body
  (_
    property: (property_identifier) @signature.name
    value: (arrow_function
      parameters: (formal_parameters) @signature.params)))
