const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const MEMBER_TIERS = [
  { level: 0, name: '普通会员', minSpend: 0     },
  { level: 1, name: '银卡会员', minSpend: 500   },
  { level: 2, name: '金卡会员', minSpend: 2000  },
  { level: 3, name: '铂金会员', minSpend: 5000  },
  { level: 4, name: '黑金会员', minSpend: 10000 },
  { level: 5, name: '钻石会员', minSpend: 20000 },
];

function calcTier(totalSpend) {
  let tier = MEMBER_TIERS[0];
  for (const t of MEMBER_TIERS) {
    if ((totalSpend || 0) >= t.minSpend) tier = t;
  }
  return tier;
}

/**
 * 余额充值（模拟，实际项目需接入微信支付）
 * event: { amount }  → 充值金额（元）
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { amount } = event;

  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    return { success: false, error: '充值金额无效' };
  }

  let user;
  try {
    const res = await db.collection('users').doc(OPENID).get();
    user = res.data;
  } catch (e) {
    return { success: false, error: '用户不存在' };
  }

  const oldTotalTopUp = user.totalTopUp  || 0;
  const newTotalTopUp = oldTotalTopUp + amount;
  const newBalance    = (user.balance || 0) + amount;

  // 会员等级由「余额 + 累计消费」共同决定，充值会提升等级
  const totalSpend = user.totalSpend || 0;
  const oldBalance = user.balance    || 0;
  const oldTier    = calcTier(oldBalance + totalSpend);
  const newTier    = calcTier((oldBalance + amount) + totalSpend);

  await db.collection('users').doc(OPENID).update({
    data: {
      balance:     _.inc(amount),
      totalTopUp:  _.inc(amount),
      memberLevel: newTier.level,
      vipLevel:    newTier.name,
    },
  });

  // 充值记录写入 pointsLogs（type: 'topup'）
  await db.collection('pointsLogs').add({
    data: {
      _openid:   OPENID,
      userId:    OPENID,
      type:      'topup',
      desc:      `充值 ¥${amount}`,
      amount,
      points:    0,
      createdAt: db.serverDate(),
    },
  });

  return {
    success:      true,
    newBalance,
    newTotalTopUp,
    newTierLevel: newTier.level,
    newTierName:  newTier.name,
    tierUpgraded: newTier.level > oldTier.level,
    oldTierName:  oldTier.name,
  };
};
