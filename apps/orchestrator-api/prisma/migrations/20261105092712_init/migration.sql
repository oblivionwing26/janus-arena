-- CreateTable
CREATE TABLE "runs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "ts" TIMESTAMPTZ(3) NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "actor_agent_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "events_run_id_seq_key" ON "events"("run_id", "seq");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written below this line (ADR 0003). Do not regenerate.
-- ---------------------------------------------------------------------------

-- The events table is append-only: reject UPDATE, DELETE and TRUNCATE.
CREATE FUNCTION "events_reject_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'events is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "events_no_update_delete"
  BEFORE UPDATE OR DELETE ON "events"
  FOR EACH ROW EXECUTE FUNCTION "events_reject_mutation"();

CREATE TRIGGER "events_no_truncate"
  BEFORE TRUNCATE ON "events"
  FOR EACH STATEMENT EXECUTE FUNCTION "events_reject_mutation"();

-- Wake live subscribers. Postgres folds identical notifications within one transaction,
-- so a batch sends one notification per run, delivered after commit.
CREATE FUNCTION "events_notify_append"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('janus_events', NEW."run_id");
  RETURN NULL;
END;
$$;

CREATE TRIGGER "events_notify_append"
  AFTER INSERT ON "events"
  FOR EACH ROW EXECUTE FUNCTION "events_notify_append"();
