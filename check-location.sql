-- Check Location table column types
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'Location'
  AND column_name IN ('id', 'code')
ORDER BY ordinal_position;
