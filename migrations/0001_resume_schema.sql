PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS resume_orders (
  id TEXT PRIMARY KEY,
  access_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  contact TEXT NOT NULL,
  target_role TEXT NOT NULL,
  target_country TEXT NOT NULL DEFAULT '',
  output_language TEXT NOT NULL DEFAULT 'en',
  raw_resume_text TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  expected_amount REAL NOT NULL,
  expected_currency TEXT NOT NULL,
  expected_cny REAL,
  tolerance_cny REAL NOT NULL,
  payment_amount REAL,
  payment_currency TEXT,
  payment_cny REAL,
  payment_difference_cny REAL,
  payment_confidence REAL,
  payment_reference TEXT,
  payment_notes TEXT,
  payment_analysis_json TEXT NOT NULL DEFAULT '{}',
  proof_key TEXT NOT NULL,
  proof_hash TEXT NOT NULL,
  proof_filename TEXT NOT NULL,
  proof_content_type TEXT NOT NULL,
  proof_size INTEGER NOT NULL,
  content_ack INTEGER NOT NULL DEFAULT 0,
  payment_ack INTEGER NOT NULL DEFAULT 0,
  job_status TEXT NOT NULL DEFAULT '',
  job_id TEXT NOT NULL DEFAULT '',
  job_summary TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_orders_proof_hash
  ON resume_orders(proof_hash);
CREATE INDEX IF NOT EXISTS idx_resume_orders_created_at
  ON resume_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resume_orders_payment_status
  ON resume_orders(payment_status, created_at);

CREATE TABLE IF NOT EXISTS resume_jobs (
  id TEXT PRIMARY KEY,
  resume_order_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL,
  target_role TEXT NOT NULL DEFAULT '',
  target_country TEXT NOT NULL DEFAULT '',
  output_language TEXT NOT NULL DEFAULT 'en',
  output_set TEXT NOT NULL DEFAULT 'ats,visual',
  config_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  error TEXT NOT NULL DEFAULT '',
  ats_pdf_key TEXT NOT NULL DEFAULT '',
  visual_pdf_key TEXT NOT NULL DEFAULT '',
  lease_token TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (resume_order_id) REFERENCES resume_orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_resume_jobs_queue
  ON resume_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_resume_jobs_order
  ON resume_jobs(resume_order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS resume_events (
  id TEXT PRIMARY KEY,
  resume_order_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (resume_order_id) REFERENCES resume_orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_resume_events_order
  ON resume_events(resume_order_id, created_at);

CREATE TABLE IF NOT EXISTS payment_proof_fingerprints (
  proof_hash TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  proof_filename TEXT NOT NULL,
  proof_size INTEGER NOT NULL,
  payment_status TEXT NOT NULL,
  payment_reference TEXT NOT NULL DEFAULT '',
  payment_amount REAL,
  payment_currency TEXT NOT NULL DEFAULT ''
);
