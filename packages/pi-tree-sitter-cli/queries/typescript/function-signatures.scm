; TypeScript/TSX function-like signatures.
; Stable capture contract:
;   @signature.name   - function/method/signature name
;   @signature.params - parameter list
;   @signature.return - return type annotation, when present

(function_declaration
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
