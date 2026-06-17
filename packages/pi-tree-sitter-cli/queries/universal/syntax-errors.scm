; Capture parse errors and missing nodes across most Tree-sitter grammars.
; Use this when validating syntax after an edit or investigating parse failures.

(ERROR) @syntax.error
(MISSING) @syntax.missing
