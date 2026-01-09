-- CreateEnum
CREATE TYPE "FetchStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "FetchResource" AS ENUM ('ALLIANCE_DETAIL', 'PLAYER_DETAIL', 'SERVER_SCAN');

-- CreateTable
CREATE TABLE "tracked_alliance" (
    "id" BIGSERIAL NOT NULL,
    "wid" INTEGER NOT NULL,
    "gid" INTEGER NOT NULL,
    "name" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracked_alliance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fetch_runs" (
    "id" UUID NOT NULL,
    "resource" "FetchResource" NOT NULL,
    "wid" INTEGER,
    "gid" INTEGER,
    "pid" INTEGER,
    "day_int" INTEGER,
    "page" INTEGER,
    "per_page" INTEGER,
    "status" "FetchStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "http_status" INTEGER,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fetch_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_payloads" (
    "fetch_run_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_payloads_pkey" PRIMARY KEY ("fetch_run_id")
);

-- CreateTable
CREATE TABLE "alliance_snapshot" (
    "wid" INTEGER NOT NULL,
    "gid" INTEGER NOT NULL,
    "day_int" INTEGER NOT NULL,
    "power" BIGINT,
    "kil" BIGINT,
    "di" INTEGER,
    "owner" TEXT,
    "c_power" BIGINT,
    "c_kil" BIGINT,
    "c_di" INTEGER,
    "created_at" TIMESTAMP(3),

    CONSTRAINT "alliance_snapshot_pkey" PRIMARY KEY ("wid","gid","day_int")
);

-- CreateTable
CREATE TABLE "dataset_alliance_history" (
    "wid" INTEGER NOT NULL,
    "gid" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "built_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_alliance_history_pkey" PRIMARY KEY ("wid","gid","version")
);

-- CreateIndex
CREATE INDEX "tracked_alliance_enabled_idx" ON "tracked_alliance"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "tracked_alliance_wid_gid_key" ON "tracked_alliance"("wid", "gid");

-- CreateIndex
CREATE INDEX "fetch_runs_resource_idx" ON "fetch_runs"("resource", "wid", "gid", "pid", "day_int");

-- CreateIndex
CREATE INDEX "fetch_runs_status_created_idx" ON "fetch_runs"("status", "created_at");

-- CreateIndex
CREATE INDEX "alliance_snapshot_wid_gid_idx" ON "alliance_snapshot"("wid", "gid");

-- CreateIndex
CREATE INDEX "alliance_snapshot_wid_day_idx" ON "alliance_snapshot"("wid", "day_int");

-- AddForeignKey
ALTER TABLE "raw_payloads" ADD CONSTRAINT "raw_payloads_fetch_run_id_fkey" FOREIGN KEY ("fetch_run_id") REFERENCES "fetch_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
