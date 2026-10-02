-- Keep an uploaded PDF immutable while giving reconstruction the text layer it is allowed to read.
-- `content` remains the original user-provided source; `extracted_text` is derived only at capture.
ALTER TABLE identity_professional_source
    ADD COLUMN extracted_text BYTEA;
