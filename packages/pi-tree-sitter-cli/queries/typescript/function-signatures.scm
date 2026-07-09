; TypeScript/TSX function-like signatures, including arrow functions and
; function expressions bound to variables or class fields.
; Stable capture contract:
;   @signature.name   - function/method/signature name
;   @signature.params - parameter list
;   @signature.return - return type annotation, when present

(function_declaration
  name: (identifier) @signature.name
  parameters: (formal_parameters) @signature.params
  return_type: (type_annotation)? @signature.return)

(generator_function_declaration
  name: (identifier) @signature.name
  parameters: (formal_parameters) @signature.params
  return_type: (type_annotation)? @signature.return)

(method_definition
  name: (property_identifier) @signature.name
  parameters: (formal_parameters) @signature.params
  return_type: (type_annotation)? @signature.return)

(method_signature
  name: (property_identifier) @signature.name
  parameters: (formal_parameters) @signature.params
  return_type: (type_annotation)? @signature.return)

(function_signature
  name: (identifier) @signature.name
  parameters: (formal_parameters) @signature.params
  return_type: (type_annotation)? @signature.return)

(abstract_method_signature
  name: (property_identifier) @signature.name
  parameters: (formal_parameters) @signature.params
  return_type: (type_annotation)? @signature.return)

(variable_declarator
  name: (identifier) @signature.name
  value: (arrow_function
    parameters: (formal_parameters) @signature.params
    return_type: (type_annotation)? @signature.return))

; Bare single-parameter arrow functions: `const f = x => ...`
(variable_declarator
  name: (identifier) @signature.name
  value: (arrow_function
    parameter: (identifier) @signature.params))

(variable_declarator
  name: (identifier) @signature.name
  value: (function_expression
    parameters: (formal_parameters) @signature.params
    return_type: (type_annotation)? @signature.return))

(public_field_definition
  name: (property_identifier) @signature.name
  value: (arrow_function
    parameters: (formal_parameters) @signature.params
    return_type: (type_annotation)? @signature.return))
