import { describe, it, expect } from "vitest";
import { RewatchRewardType } from "@prisma/client";
import {
  computeTotalStamps,
  computeMilestoneStatuses,
  type MilestoneInput,
  type CardStatusInput,
} from "../lib/rewatch";

// ─── computeTotalStamps ─────────────────────────────────────────────────────────

describe("computeTotalStamps", () => {
  it("티켓이 없으면 0을 반환한다", () => {
    expect(computeTotalStamps([])).toBe(0);
  });

  it("각 티켓의 stampCount를 합산한다", () => {
    expect(computeTotalStamps([{ stampCount: 1 }, { stampCount: 2 }, { stampCount: 3 }])).toBe(6);
  });

  it("1을 초과하는 도장 수(연석 등)도 합산한다", () => {
    expect(computeTotalStamps([{ stampCount: 2 }, { stampCount: 1 }])).toBe(3);
  });
});

// ─── computeMilestoneStatuses ───────────────────────────────────────────────────

const emptyCard: CardStatusInput = { voucherUsages: [], merchandiseReceipts: [] };

describe("computeMilestoneStatuses - 달성 여부", () => {
  const milestones: MilestoneInput[] = [{ id: "m1", stampCount: 3, rewards: [] }];

  it("총 도장 수가 요구치 미만이면 achieved=false", () => {
    const [status] = computeMilestoneStatuses(milestones, emptyCard, 2);
    expect(status.achieved).toBe(false);
  });

  it("총 도장 수가 요구치와 같으면 achieved=true (경계값)", () => {
    const [status] = computeMilestoneStatuses(milestones, emptyCard, 3);
    expect(status.achieved).toBe(true);
  });

  it("총 도장 수가 요구치를 초과해도 achieved=true", () => {
    const [status] = computeMilestoneStatuses(milestones, emptyCard, 5);
    expect(status.achieved).toBe(true);
  });

  it("마일스톤 순서를 유지하며 각각 독립 판정한다", () => {
    const multi: MilestoneInput[] = [
      { id: "m1", stampCount: 2, rewards: [] },
      { id: "m2", stampCount: 5, rewards: [] },
    ];
    const statuses = computeMilestoneStatuses(multi, emptyCard, 3);
    expect(statuses.map((s) => [s.milestoneId, s.achieved])).toEqual([
      ["m1", true],
      ["m2", false],
    ]);
  });
});

describe("computeMilestoneStatuses - 할인권(DISCOUNT_VOUCHER)", () => {
  function voucherMilestone(voucherQty: number | null): MilestoneInput {
    return {
      id: "m1",
      stampCount: 1,
      rewards: [
        {
          id: "r1",
          rewardType: RewatchRewardType.DISCOUNT_VOUCHER,
          discountPercent: 20,
          voucherQty,
          merchandiseDesc: null,
        },
      ],
    };
  }

  it("사용 이력이 없으면 잔여 = voucherQty", () => {
    const [status] = computeMilestoneStatuses([voucherMilestone(3)], emptyCard, 1);
    const reward = status.rewardStatuses[0] as { voucherUsed: number; voucherRemaining: number };
    expect(reward.voucherUsed).toBe(0);
    expect(reward.voucherRemaining).toBe(3);
  });

  it("voucherQty가 null이면 기본 1로 계산한다", () => {
    const [status] = computeMilestoneStatuses([voucherMilestone(null)], emptyCard, 1);
    const reward = status.rewardStatuses[0] as { voucherRemaining: number };
    expect(reward.voucherRemaining).toBe(1);
  });

  it("해당 reward의 사용 이력만 세고 잔여를 차감한다", () => {
    const card: CardStatusInput = {
      voucherUsages: [
        { id: "u1", rewardId: "r1", ticketId: "t1", usedAt: new Date("2024-01-01") },
        { id: "u2", rewardId: "r1", ticketId: "t2", usedAt: new Date("2024-01-02") },
        // 다른 reward 사용분 → 무시되어야 함
        { id: "u3", rewardId: "other", ticketId: "t3", usedAt: new Date("2024-01-03") },
      ],
      merchandiseReceipts: [],
    };
    const [status] = computeMilestoneStatuses([voucherMilestone(3)], card, 1);
    const reward = status.rewardStatuses[0] as {
      voucherUsed: number;
      voucherRemaining: number;
      usages: { ticketId: string }[];
    };
    expect(reward.voucherUsed).toBe(2);
    expect(reward.voucherRemaining).toBe(1);
    expect(reward.usages.map((u) => u.ticketId)).toEqual(["t1", "t2"]);
  });
});

describe("computeMilestoneStatuses - 굿즈(MERCHANDISE)", () => {
  const milestone: MilestoneInput = {
    id: "m1",
    stampCount: 1,
    rewards: [
      {
        id: "r1",
        rewardType: RewatchRewardType.MERCHANDISE,
        discountPercent: null,
        voucherQty: null,
        merchandiseDesc: "포토카드",
      },
    ],
  };

  it("수령 영수증이 없으면 received=false, receiptId=null", () => {
    const [status] = computeMilestoneStatuses([milestone], emptyCard, 1);
    const reward = status.rewardStatuses[0] as {
      merchandiseReceived: boolean;
      merchandiseReceiptId: string | null;
    };
    expect(reward.merchandiseReceived).toBe(false);
    expect(reward.merchandiseReceiptId).toBeNull();
  });

  it("수령 영수증이 있으면 received/receivedAt/receiptId를 반영한다", () => {
    const receivedAt = new Date("2024-05-01");
    const card: CardStatusInput = {
      voucherUsages: [],
      merchandiseReceipts: [{ id: "rec1", rewardId: "r1", received: true, receivedAt }],
    };
    const [status] = computeMilestoneStatuses([milestone], card, 1);
    const reward = status.rewardStatuses[0] as {
      merchandiseReceived: boolean;
      merchandiseReceiptId: string | null;
      merchandiseReceivedAt: Date | null;
    };
    expect(reward.merchandiseReceived).toBe(true);
    expect(reward.merchandiseReceiptId).toBe("rec1");
    expect(reward.merchandiseReceivedAt).toBe(receivedAt);
  });
});

describe("computeMilestoneStatuses - 혼합 혜택", () => {
  it("한 마일스톤에 할인권+굿즈가 섞여 있어도 타입별로 올바르게 계산한다", () => {
    const milestone: MilestoneInput = {
      id: "m1",
      stampCount: 2,
      rewards: [
        {
          id: "voucher",
          rewardType: RewatchRewardType.DISCOUNT_VOUCHER,
          discountPercent: 10,
          voucherQty: 2,
          merchandiseDesc: null,
        },
        {
          id: "goods",
          rewardType: RewatchRewardType.MERCHANDISE,
          discountPercent: null,
          voucherQty: null,
          merchandiseDesc: "키링",
        },
      ],
    };
    const card: CardStatusInput = {
      voucherUsages: [{ id: "u1", rewardId: "voucher", ticketId: "t1", usedAt: new Date() }],
      merchandiseReceipts: [{ id: "rec1", rewardId: "goods", received: true, receivedAt: new Date() }],
    };

    const [status] = computeMilestoneStatuses([milestone], card, 2);
    expect(status.achieved).toBe(true);
    expect(status.rewardStatuses).toHaveLength(2);

    const voucher = status.rewardStatuses[0] as { voucherRemaining: number };
    const goods = status.rewardStatuses[1] as { merchandiseReceived: boolean };
    expect(voucher.voucherRemaining).toBe(1);
    expect(goods.merchandiseReceived).toBe(true);
  });
});
