-- CreateTable
CREATE TABLE "players" (
    "wid" INTEGER NOT NULL,
    "pid" INTEGER NOT NULL,
    "nick" TEXT,
    "lv" INTEGER,
    "first_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_pkey" PRIMARY KEY ("wid","pid")
);

-- CreateTable
CREATE TABLE "player_snapshots" (
    "wid" INTEGER NOT NULL,
    "pid" INTEGER NOT NULL,
    "day_int" INTEGER NOT NULL,
    "gid" INTEGER,
    "gnick" TEXT,
    "power" BIGINT,
    "maxpower" BIGINT,
    "sumkill" BIGINT,
    "die" BIGINT,
    "score" BIGINT,
    "caiji" BIGINT,
    "created_at" TIMESTAMP(3),

    CONSTRAINT "player_snapshot_pkey" PRIMARY KEY ("wid","pid","day_int")
);

-- CreateTable
CREATE TABLE "player_alliance_membership" (
    "wid" INTEGER NOT NULL,
    "pid" INTEGER NOT NULL,
    "day_int" INTEGER NOT NULL,
    "gid" INTEGER NOT NULL,
    "gnick" TEXT,

    CONSTRAINT "player_alliance_membership_pkey" PRIMARY KEY ("wid","pid","day_int")
);

-- CreateIndex
CREATE INDEX "player_wid_idx" ON "players"("wid");

-- CreateIndex
CREATE INDEX "player_snapshot_wid_day_idx" ON "player_snapshots"("wid", "day_int");

-- CreateIndex
CREATE INDEX "player_snapshot_wid_gid_day_idx" ON "player_snapshots"("wid", "gid", "day_int");

-- CreateIndex
CREATE INDEX "player_alliance_membership_wid_gid_day_idx" ON "player_alliance_membership"("wid", "gid", "day_int");
