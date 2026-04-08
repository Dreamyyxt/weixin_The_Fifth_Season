const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const MEMBER_TIERS = [
  { level: 0, name: '普通会员', minSpend: 0     },
  { level: 1, name: '银卡会员', minSpend: 500   },
  { level: 2, name: '金卡会员', minSpend: 2000  },
  { level: 3, name: '铂金会员', minSpend: 5000  },
  { level: 4, name: '黑金会员', minSpend: 10000 },
  { level: 5, name: '钻石会员', minSpend: 20000 },
];

function calcTier(tierBase) {
  let tier = MEMBER_TIERS[0];
  for (const t of MEMBER_TIERS) {
    if ((tierBase || 0) >= t.minSpend) tier = t;
  }
  return tier;
}

async function fetchAll(collection, where) {
  const results = [];
  let skip = 0;
  while (true) {
    const res = await db.collection(collection).where(where).skip(skip).limit(100).get();
    if (!res.data || res.data.length === 0) break;
    results.push(...res.data);
    if (res.data.length < 100) break;
    skip += 100;
  }
  return results;
}

/**
 * 重新计算用户统计数据：
 * - totalSpend  = 所有已完成+已付款订单的 finalPrice 之和
 * - totalTopUp  = 所有充值记录 amount 之和
 * - balanceUsed = 所有已完成+已付款且支付方式为余额的订单 finalPrice 之和
 * - balance     = totalTopUp - balanceUsed
 * - vipLevel    = calcTier(totalSpend + balance)
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  let caller;
  try {
    const res = await db.collection('users').doc(OPENID).get();
    caller = res.data;
  } catch (e) {
    return { success: false, error: '用户不存在' };
  }
  if (caller.role !== 'admin') return { success: false, error: '无权限' };

  const { targetUserId } = event;
  if (!targetUserId) return { success: false, error: '缺少参数' };

  try {
    await db.collection('users').doc(targetUserId).get();
  } catch (e) {
    return { success: false, error: '目标用户不存在' };
  }

  // 1. 所有已完成+已付款订单
  const completedBookings = await fetchAll('bookings', {
    userId: targetUserId,
    status: 'completed',
    paymentStatus: 'paid',
  });

  // 2. 所有充值记录
  const topupLogs = await fetchAll('pointsLogs', {
    userId: targetUserId,
    type: 'topup',
  });

  // 3. 计算
  const totalSpend = completedBookings.reduce((sum, b) => sum + (b.finalPrice || 0), 0);
  const totalTopUp = topupLogs.reduce((sum, t) => sum + (t.amount || 0), 0);
  const balanceUsed = completedBookings
    .filter(b => b.paymentMethod === 'balance')
    .reduce((sum, b) => sum + (b.finalPrice || 0), 0);
  const balance = totalTopUp - balanceUsed;
  const tier = calcTier(totalSpend + balance);

  // 4. 更新用户
  await db.collection('users').doc(targetUserId).update({
    data: {
      totalSpend,
      totalTopUp,
      balance,
      memberLevel: tier.level,
      vipLevel: tier.name,
    },
  });

  return {
    success: true,
    totalSpend,
    totalTopUp,
    balanceUsed,
    balance,
    vipLevel: tier.name,
    memberLevel: tier.level,
    bookingCount: completedBookings.length,
    topupCount: topupLogs.length,
  };
};
