-- 책갈피 D1 스키마. Cloudflare 대시보드의 D1 데이터베이스 > Console 탭에 붙여넣어 실행하세요.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  picture TEXT
);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  cover TEXT,
  isbn TEXT,
  text TEXT NOT NULL,
  rating_sum INTEGER NOT NULL,
  rating_count INTEGER NOT NULL,
  comment_count INTEGER NOT NULL,
  owner_uid TEXT NOT NULL,
  owner_name TEXT,
  owner_photo TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_books_created_at ON books (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_books_updated_at ON books (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_books_title ON books (title);
CREATE UNIQUE INDEX IF NOT EXISTS idx_books_isbn ON books (isbn) WHERE isbn IS NOT NULL AND isbn != '';

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  text TEXT NOT NULL,
  rating INTEGER NOT NULL,
  author_uid TEXT NOT NULL,
  author_name TEXT,
  author_photo TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_book_id ON comments (book_id);

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (comment_id, user_id)
);
