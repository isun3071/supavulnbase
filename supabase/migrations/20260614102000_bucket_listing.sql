-- The media picker needs to enumerate buckets from the browser, so let the
-- anon and authenticated roles list them.
--
-- Fixture note: without this, GET /storage/v1/bucket returns an empty array to
-- an anonymous caller even though buckets exist, which made storage-001
-- declared-but-undiscoverable — reachable only by guessing the bucket name.
-- A finding that cannot be discovered is not a finding.
create policy "Buckets are listable"
  on storage.buckets for select
  using (true);
