-- ClickHouse initialization (idempotent)
-- Creates blog analytics tables and seeds them with 100 sample users/events for MCP testing.

CREATE TABLE IF NOT EXISTS blog_pages (
  page_id UInt32,
  title String,
  author String,
  category String,
  created_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree() ORDER BY (page_id);

CREATE TABLE IF NOT EXISTS page_clicks (
  click_id UInt64,
  page_id UInt32,
  user_id UInt32,
  clicked_at DateTime,
  click_type String
) ENGINE = MergeTree() ORDER BY (page_id, clicked_at);

CREATE TABLE IF NOT EXISTS page_views (
  view_id UInt64,
  page_id UInt32,
  user_id UInt32,
  view_duration Float32,
  viewed_at DateTime
) ENGINE = MergeTree() ORDER BY (page_id, viewed_at);

CREATE TABLE IF NOT EXISTS successful_downloads (
  download_id UInt64,
  page_id UInt32,
  user_id UInt32,
  downloaded_at DateTime,
  file_size_kb UInt32
) ENGINE = MergeTree() ORDER BY (page_id, downloaded_at);

CREATE TABLE IF NOT EXISTS user_journeys (
  journey_id UInt64,
  user_id UInt32,
  page_sequence Array(UInt32),
  journey_start DateTime,
  journey_end DateTime
) ENGINE = MergeTree() ORDER BY (user_id, journey_start);

-- Seed deterministic data if tables are empty
INSERT INTO blog_pages (page_id, title, author, category, created_at)
SELECT
  number + 1,
  concat('Blog Page ', number + 1),
  arrayElement(['Alice','Bob','Cara','Dev','Eva'], number % 5 + 1),
  arrayElement(['News','Guides','Reviews','Announcements'], number % 4 + 1),
  now() - INTERVAL (number % 365) DAY
FROM numbers(100)
WHERE NOT EXISTS (SELECT * FROM blog_pages LIMIT 1);

INSERT INTO page_clicks (click_id, page_id, user_id, clicked_at, click_type)
SELECT
  (number + 1) * 10,
  (number % 20) + 1,
  (number % 50) + 1,
  now() - INTERVAL (number % 7) DAY - INTERVAL (number % 3600) SECOND,
  arrayElement(['cta','link','image','button'], (number % 4) + 1)
FROM numbers(100)
WHERE NOT EXISTS (SELECT * FROM page_clicks LIMIT 1);

INSERT INTO page_views (view_id, page_id, user_id, view_duration, viewed_at)
SELECT
  (number + 1) * 100,
  (number % 20) + 1,
  (number % 50) + 1,
  10.0 + (number % 50),
  now() - INTERVAL (number % 10) DAY
FROM numbers(100)
WHERE NOT EXISTS (SELECT * FROM page_views LIMIT 1);

INSERT INTO successful_downloads (download_id, page_id, user_id, downloaded_at, file_size_kb)
SELECT
  (number + 1) * 1000,
  (number % 20) + 1,
  (number % 50) + 1,
  now() - INTERVAL (number % 5) DAY,
  200 + (number % 800)
FROM numbers(100)
WHERE NOT EXISTS (SELECT * FROM successful_downloads LIMIT 1);

INSERT INTO user_journeys (journey_id, user_id, page_sequence, journey_start, journey_end)
SELECT
  (number + 1) * 10000,
  (number % 50) + 1,
  arrayMap(x -> (x % 20) + 1, arrayEnumerate(arrayResize(array(1,2,3,4,5,6), 5))),
  now() - INTERVAL ((number % 3) + 1) DAY,
  now() - INTERVAL ((number % 3)) DAY
FROM numbers(100)
WHERE NOT EXISTS (SELECT * FROM user_journeys LIMIT 1);
