; pi TypeScript extension tool registrations.
; Finds calls like `pi.registerTool({ name: "tool_name", ... })`.

((call_expression
  function: (member_expression
    object: (identifier) @tool.registry_object
    property: (property_identifier) @tool.registry_method)
  arguments: (arguments
    (object
      (pair
        key: (property_identifier) @tool.name_key
        value: (string (string_fragment) @tool.name)))))
  (#eq? @tool.registry_method "registerTool")
  (#eq? @tool.name_key "name"))
