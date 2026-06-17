; Python function and method signatures.
; Stable capture contract:
;   @signature.name   - function/method name
;   @signature.params - parameter list
;   @signature.return - return annotation, when present

(function_definition
  name: (identifier) @signature.name
  parameters: (parameters) @signature.params
  return_type: (type)? @signature.return)
