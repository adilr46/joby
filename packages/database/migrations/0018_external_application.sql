-- Owner: Application. User-reported facts about an application made outside Joby.
ALTER TABLE application ADD COLUMN external_details jsonb;
ALTER TABLE application ADD CONSTRAINT application_external_details_shape CHECK (
  external_details IS NULL OR (
    jsonb_typeof(external_details) = 'object' AND
    jsonb_typeof(external_details->'company') = 'string' AND
    jsonb_typeof(external_details->'role') = 'string' AND
    external_details ? 'company' AND external_details ? 'role'
  )
);
ALTER TABLE application_lineage ALTER COLUMN identity_revision DROP NOT NULL;
ALTER TABLE application_lineage ALTER COLUMN opportunity_revision DROP NOT NULL;
