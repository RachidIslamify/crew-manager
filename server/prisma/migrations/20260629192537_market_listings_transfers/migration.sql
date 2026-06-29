-- AlterTable
ALTER TABLE "MarketListing" ADD COLUMN     "askRatio" DOUBLE PRECISION,
ADD COLUMN     "sellerId" TEXT,
ADD COLUMN     "sellerIsBot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "squadMemberId" TEXT;

-- AlterTable
ALTER TABLE "SquadMember" ADD COLUMN     "listingId" TEXT;

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "buyerId" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerIsBot" BOOLEAN NOT NULL DEFAULT false,
    "sellerId" TEXT,
    "sellerName" TEXT,
    "sellerIsBot" BOOLEAN NOT NULL DEFAULT false,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transfer_worldId_day_idx" ON "Transfer"("worldId", "day");

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
