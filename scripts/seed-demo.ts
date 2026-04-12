/**
 * Demo account seeding script.
 *
 * Usage:
 *   npx ts-node scripts/seed-demo.ts <source-username>
 *
 * What it does:
 *   1. Deletes ALL existing data for the demo account (demouser)
 *   2. Copies tickets, actors, wishlist, and rewatch cards from the source account
 *
 * Safe to run multiple times — always wipes demo data first.
 */

import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const DEMO_USERNAME = "demouser";

async function main() {
  const sourceUsername = process.argv[2];
  if (!sourceUsername) {
    console.error("Usage: npx ts-node scripts/seed-demo.ts <source-username>");
    process.exit(1);
  }

  const [sourceUser, demoUser] = await Promise.all([
    prisma.user.findUnique({ where: { username: sourceUsername } }),
    prisma.user.findUnique({ where: { username: DEMO_USERNAME } }),
  ]);

  if (!sourceUser) {
    console.error(`Source user '${sourceUsername}' not found.`);
    process.exit(1);
  }
  if (!demoUser) {
    console.error(`Demo user '${DEMO_USERNAME}' not found.`);
    process.exit(1);
  }

  console.log(`Source: ${sourceUser.username} (${sourceUser.id})`);
  console.log(`Demo:   ${demoUser.username} (${demoUser.id})`);

  // ── Step 1: Wipe demo account data ────────────────────────────────────────
  console.log("\n[1/2] Clearing demo account data...");

  // RewatchVoucherUsage has a non-cascading FK to tickets, so delete rewatch
  // data first before deleting tickets.
  await prisma.rewatchSeason.deleteMany({ where: { userId: demoUser.id } });
  await prisma.userPerformanceMark.deleteMany({ where: { userId: demoUser.id } });
  await prisma.userActorImage.deleteMany({ where: { userId: demoUser.id } });
  await prisma.ticket.deleteMany({ where: { userId: demoUser.id } });

  console.log("  Done.");

  // ── Step 2: Copy data from source to demo ─────────────────────────────────
  console.log("\n[2/2] Copying data from source account...");

  // -- Tickets + TicketActors --
  const sourceTickets = await prisma.ticket.findMany({
    where: { userId: sourceUser.id },
    include: { ticketActors: true },
  });

  const ticketIdMap = new Map<string, string>(); // oldId → newId

  for (const ticket of sourceTickets) {
    const newId = uuidv4();
    ticketIdMap.set(ticket.id, newId);

    await prisma.ticket.create({
      data: {
        id: newId,
        userId: demoUser.id,
        date: ticket.date,
        time: ticket.time,
        performanceName: ticket.performanceName,
        genre: ticket.genre,
        isChild: ticket.isChild,
        theater: ticket.theater,
        seat: ticket.seat,
        ticketPrice: ticket.ticketPrice,
        companion: ticket.companion,
        mdPrice: ticket.mdPrice,
        rating: ticket.rating,
        review: ticket.review,
        posterUrl: ticket.posterUrl,
        isLinked: ticket.isLinked,
        kopisId: ticket.kopisId,
      },
    });

    if (ticket.ticketActors.length > 0) {
      await prisma.ticketActor.createMany({
        data: ticket.ticketActors.map((ta) => ({
          ticketId: newId,
          actorId: ta.actorId,
        })),
      });
    }
  }
  console.log(`  Tickets: ${sourceTickets.length} copied.`);

  // -- UserActorImages --
  const sourceActorImages = await prisma.userActorImage.findMany({
    where: { userId: sourceUser.id },
  });
  if (sourceActorImages.length > 0) {
    await prisma.userActorImage.createMany({
      data: sourceActorImages.map((img) => ({
        userId: demoUser.id,
        actorId: img.actorId,
        imageUrl: img.imageUrl,
      })),
    });
  }
  console.log(`  Actor images: ${sourceActorImages.length} copied.`);

  // -- UserPerformanceMarks (wishlist) --
  const sourceMarks = await prisma.userPerformanceMark.findMany({
    where: { userId: sourceUser.id },
  });
  if (sourceMarks.length > 0) {
    await prisma.userPerformanceMark.createMany({
      data: sourceMarks.map((m) => ({
        userId: demoUser.id,
        kopisId: m.kopisId,
        title: m.title,
        posterUrl: m.posterUrl,
        startDate: m.startDate,
        endDate: m.endDate,
        venue: m.venue,
      })),
    });
  }
  console.log(`  Wishlist: ${sourceMarks.length} copied.`);

  // -- RewatchSeasons (+ milestones, rewards, cards, card tickets, usages) --
  const sourceSeasons = await prisma.rewatchSeason.findMany({
    where: { userId: sourceUser.id },
    include: {
      milestones: {
        include: {
          rewards: {
            include: {
              voucherUsages: true,
              merchandiseReceipts: true,
            },
          },
        },
      },
      cards: {
        include: {
          cardTickets: true,
          voucherUsages: true,
          merchandiseReceipts: true,
        },
      },
    },
  });

  for (const season of sourceSeasons) {
    const newSeasonId = uuidv4();

    await prisma.rewatchSeason.create({
      data: {
        id: newSeasonId,
        userId: demoUser.id,
        mt20id: season.mt20id,
        title: season.title,
        posterUrl: season.posterUrl,
        startDate: season.startDate,
        endDate: season.endDate,
        venue: season.venue,
      },
    });

    // milestoneId map for this season
    const milestoneIdMap = new Map<string, string>();
    const rewardIdMap = new Map<string, string>();

    for (const milestone of season.milestones) {
      const newMilestoneId = uuidv4();
      milestoneIdMap.set(milestone.id, newMilestoneId);

      await prisma.rewatchMilestone.create({
        data: {
          id: newMilestoneId,
          seasonId: newSeasonId,
          stampCount: milestone.stampCount,
        },
      });

      for (const reward of milestone.rewards) {
        const newRewardId = uuidv4();
        rewardIdMap.set(reward.id, newRewardId);

        await prisma.rewatchMilestoneReward.create({
          data: {
            id: newRewardId,
            milestoneId: newMilestoneId,
            rewardType: reward.rewardType,
            discountPercent: reward.discountPercent,
            voucherQty: reward.voucherQty,
            merchandiseDesc: reward.merchandiseDesc,
          },
        });
      }
    }

    // cardId map for this season
    const cardIdMap = new Map<string, string>();

    for (const card of season.cards) {
      const newCardId = uuidv4();
      cardIdMap.set(card.id, newCardId);

      await prisma.rewatchCard.create({
        data: {
          id: newCardId,
          seasonId: newSeasonId,
          label: card.label,
        },
      });

      // CardTickets — only copy if the ticket was also copied
      for (const ct of card.cardTickets) {
        const newTicketId = ticketIdMap.get(ct.ticketId);
        if (newTicketId) {
          await prisma.rewatchCardTicket.create({
            data: {
              cardId: newCardId,
              ticketId: newTicketId,
              stampCount: ct.stampCount,
            },
          });
        }
      }

      // VoucherUsages on this card
      for (const vu of card.voucherUsages) {
        const newRewardId = rewardIdMap.get(vu.rewardId);
        const newTicketId = ticketIdMap.get(vu.ticketId);
        if (newRewardId && newTicketId) {
          await prisma.rewatchVoucherUsage.create({
            data: {
              rewardId: newRewardId,
              cardId: newCardId,
              ticketId: newTicketId,
            },
          });
        }
      }

      // MerchandiseReceipts on this card
      for (const mr of card.merchandiseReceipts) {
        const newRewardId = rewardIdMap.get(mr.rewardId);
        if (newRewardId) {
          await prisma.rewatchMerchandiseReceipt.create({
            data: {
              rewardId: newRewardId,
              cardId: newCardId,
              received: mr.received,
              receivedAt: mr.receivedAt,
            },
          });
        }
      }
    }
  }
  console.log(`  Rewatch seasons: ${sourceSeasons.length} copied.`);

  console.log("\nDone! Demo account is ready.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
