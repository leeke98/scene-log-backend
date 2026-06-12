import { RewatchRewardType } from "@prisma/client";

// ─── 입력 타입 ─────────────────────────────────────────────────────────────────
// Prisma include 결과를 그대로 받을 수 있도록 필요한 필드만 정의한다.

export interface RewardInput {
  id: string;
  rewardType: RewatchRewardType;
  discountPercent: number | null;
  voucherQty: number | null;
  merchandiseDesc: string | null;
}

export interface MilestoneInput {
  id: string;
  stampCount: number;
  rewards: RewardInput[];
}

export interface VoucherUsageInput {
  id: string;
  rewardId: string;
  ticketId: string;
  usedAt: Date;
}

export interface MerchandiseReceiptInput {
  id: string;
  rewardId: string;
  received: boolean;
  receivedAt: Date | null;
}

/** 마일스톤 달성/혜택 상태 계산에 필요한 카드 단위 데이터 */
export interface CardStatusInput {
  voucherUsages: VoucherUsageInput[];
  merchandiseReceipts: MerchandiseReceiptInput[];
}

// ─── 계산 함수 ─────────────────────────────────────────────────────────────────

/** 카드의 총 도장 수 = 연결된 모든 cardTicket.stampCount 합 */
export const computeTotalStamps = (cardTickets: { stampCount: number }[]): number =>
  cardTickets.reduce((sum, ct) => sum + ct.stampCount, 0);

/**
 * 카드 기준 마일스톤별 달성 여부와 혜택 상태를 계산한다.
 * - achieved: 총 도장 수가 마일스톤 요구치 이상이면 true
 * - 할인권(DISCOUNT_VOUCHER): voucherQty(기본 1) - 해당 reward의 사용 횟수 = 잔여
 * - 굿즈(MERCHANDISE): 수령 영수증 존재 여부로 received 판정
 */
export const computeMilestoneStatuses = (
  milestones: MilestoneInput[],
  card: CardStatusInput,
  totalStamps: number
) =>
  milestones.map((m) => {
    const achieved = totalStamps >= m.stampCount;

    const rewardStatuses = m.rewards.map((r) => {
      if (r.rewardType === RewatchRewardType.DISCOUNT_VOUCHER) {
        const usages = card.voucherUsages.filter((u) => u.rewardId === r.id);
        const remaining = (r.voucherQty ?? 1) - usages.length;
        return {
          rewardId: r.id,
          rewardType: r.rewardType,
          discountPercent: r.discountPercent,
          voucherQty: r.voucherQty,
          voucherUsed: usages.length,
          voucherRemaining: remaining,
          usages: usages.map((u) => ({ id: u.id, ticketId: u.ticketId, usedAt: u.usedAt })),
        };
      } else {
        const receipt = card.merchandiseReceipts.find((rec) => rec.rewardId === r.id);
        return {
          rewardId: r.id,
          rewardType: r.rewardType,
          merchandiseDesc: r.merchandiseDesc,
          merchandiseReceiptId: receipt?.id ?? null,
          merchandiseReceived: receipt?.received ?? false,
          merchandiseReceivedAt: receipt?.receivedAt ?? null,
        };
      }
    });

    return { milestoneId: m.id, achieved, rewardStatuses };
  });
