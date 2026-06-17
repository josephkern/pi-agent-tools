; JavaScript/JSX function-like signatures.
; Stable capture contract:
;   @signature.name   - function/method name
;   @signature.params - parameter list

(function_declaration
  name: (identifier) @signature.name
  parameters: (formal_parameters) @signature.params)

(method_definition
  name: (property_identifier) @signature.name
  parameters: (formal_parameters) @signature.params)

(generator_function_declaration
  name: (identifier) @signature.name
  parameters: (formal_parameters) @signature.params)
