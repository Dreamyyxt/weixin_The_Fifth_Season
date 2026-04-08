const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ═══════════════════════════════════════════════════════════════════════════
// 支付模式开关（与 payDeposit 保持一致）
//   'mock'   — 测试/上线前：跳过真实支付，直接标记订单已付
//   'wechat' — 生产环境：走微信支付 JSAPI 下单
// ═══════════════════════════════════════════════════════════════════════════
const PAYMENT_MODE = 'mock'; // ← 上线后改为 'wechat'

// 会员等级 + 积分倍率（消费每 10 元 = 1 积分 × 倍率）
const MEMBER_TIERS = [
  { level: 0, name: '普通会员', minSpend: 0,     pointsMultiplier: 1 },
  { level: 1, name: '银卡会员', minSpend: 500,   pointsMultiplier: 2 },
  { level: 2, name: '金卡会员', minSpend: 2000,  pointsMultiplier: 3 },
  { level: 3, name: '铂金会员', minSpend: 5000,  pointsMultiplier: 4 },
  { level: 4, name: '黑金会员', minSpend: 10000, pointsMultiplier: 5 },
  { level: 5, name: '钻石会员', minSpend: 20000, pointsMultiplier: 6 },
];

function calcTier(tierBase) {
  let tier = MEMBER_TIERS[0];
  for (const t of MEMBER_TIERS) {
    if ((tierBase || 0) >= t.minSpend) tier = t;
  }
  return tier;
}

/**
 * 标记订单已付，并更新用户累计消费 + 积分 + 会员等级
 * 消费逻辑：每消费 10 元得 1 积分，按当前等级倍率累计
 * 会员等级：由 累计消费(totalSpend) + 累计充值(totalTopUp) 共同决定
 */
async function _markPaidAndAwardPoints(bookingId, booking, openId, paymentMethod) {
  // 1. 标记订单已付，同时写入支付方式，供业绩统计区分现金/耗卡
  await db.collection('bookings').doc(bookingId).update({
    data: { paymentStatus: 'paid', paymentMethod: paymentMethod || 'wechat', paidAt: db.serverDate() },
  });

  // 2. 更新用户积分 + totalSpend + 会员等级
  try {
    const userRes = await db.collection('users').doc(openId).get();
    const user = userRes.data;

    const oldTotalSpend = user.totalSpend || 0;
    const newTotalSpend = oldTotalSpend + booking.finalPrice;
    // 会员等级由「余额 + 累计消费」共同决定
    const userBalance   = user.balance   || 0;
    const oldTierBase   = oldTotalSpend + userBalance;
    const newTierBase   = newTotalSpend + userBalance;

    const oldTier      = calcTier(oldTierBase);
    const newTier      = calcTier(newTierBase);
    const multiplier   = oldTier.pointsMultiplier;
    const pointsEarned = Math.floor(booking.finalPrice / 10) * multiplier;

    const userUpdate = {
      totalSpend:  _.inc(booking.finalPrice),
      memberLevel: newTier.level,
      vipLevel:    newTier.name,
    };
    if (pointsEarned > 0) userUpdate.points = _.inc(pointsEarned);

    await db.collection('users').doc(openId).update({ data: userUpdate });

    if (pointsEarned > 0) {
      await db.collection('pointsLogs').add({
        data: {
          _openid:   openId,
          userId:    openId,
          type:      'earn',
          desc:      `消费积分（${booking.serviceName || '服务'}）`,
          points:    pointsEarned,
          amount:    booking.finalPrice,
          createdAt: db.serverDate(),
        },
      });
    }

    const newPoints = (user.points || 0) + pointsEarned;

    return {
      pointsEarned,
      newPoints,
      tierUpgraded: newTier.level > oldTier.level,
      newTierName:  newTier.name,
      newTotalSpend,
    };
  } catch (e) {
    console.error('_markPaidAndAwardPoints: points award failed', e);
    return { pointsEarned: 0, tierUpgraded: false };
  }
}

// ─── 微信支付商户配置（上线前填写，与 payDeposit 一致） ───────────────────────
const MCH_CONFIG = {
  appId:      'YOUR_APP_ID',
  mchId:      'YOUR_MCH_ID',
  apiV3Key:   'YOUR_MCH_API_V3_KEY',
  privateKey: 'YOUR_PRIVATE_KEY_PEM',
  serialNo:   'YOUR_CERT_SERIAL_NO',
  notifyUrl:  'YOUR_PAYMENT_NOTIFY_HTTP_TRIGGER_URL',
};

/**
 * 发起订单尾款支付
 * event: { bookingId: string }
 *
 * 自动计算应付金额 = finalPrice - (已付定金)
 * 支付成功后：更新 totalSpend、发放积分、重算会员等级
 *
 * 返回:
 *   mock 模式  → { success: true, mode: 'mock', pointsEarned, tierUpgraded, newTierName }
 *   wechat 模式 → { success: true, mode: 'wechat', payParams: {...} }
 *   失败        → { success: false, error: string }
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  // paymentMethod: 'balance'（余额支付）| 'wechat'（微信支付），默认余额
  const { bookingId, paymentMethod = 'balance' } = event;

  if (!bookingId) return { success: false, error: '缺少 bookingId' };

  let booking;
  try {
    const res = await db.collection('bookings').doc(bookingId).get();
    booking = res.data;
  } catch (e) {
    return { success: false, error: '预约不存在' };
  }

  if (booking._openid !== OPENID) return { success: false, error: '无权操作' };
  if (booking.status !== 'completed') return { success: false, error: '订单尚未完成，无法支付' };
  if (booking.finalPrice === undefined || booking.finalPrice === null) {
    return { success: false, error: '技师尚未填写最终金额' };
  }
  if (booking.paymentStatus === 'paid') {
    return { success: true, alreadyPaid: true, mode: paymentMethod };
  }

  // 应付金额 = 最终价格 - 已付定金
  const depositPaid = booking.depositStatus === 'paid' ? (booking.depositAmount || 0) : 0;
  const amountDue   = Math.max(0, booking.finalPrice - depositPaid);

  // 无需支付（全额由定金覆盖）—— 仍需发积分，视为余额/定金已覆盖
  if (amountDue === 0) {
    const result = await _markPaidAndAwardPoints(bookingId, booking, OPENID, 'balance');
    return { success: true, mode: 'balance', amountDue: 0, ...result };
  }

  // ─── 余额支付 ────────────────────────────────────────────────────────────
  if (paymentMethod === 'balance') {
    let user;
    try {
      const userRes = await db.collection('users').doc(OPENID).get();
      user = userRes.data;
    } catch (e) {
      return { success: false, error: '用户信息读取失败' };
    }

    const currentBalance = user.balance || 0;
    if (currentBalance < amountDue) {
      return {
        success: false,
        error: `余额不足，当前余额 ¥${currentBalance}，需支付 ¥${amountDue}`,
        insufficientBalance: true,
        currentBalance,
      };
    }

    await db.collection('users').doc(OPENID).update({
      data: { balance: _.inc(-amountDue) },
    });

    const result = await _markPaidAndAwardPoints(bookingId, booking, OPENID, 'balance');
    return {
      success:    true,
      mode:       'balance',
      amountDue,
      newBalance: currentBalance - amountDue,
      ...result,
    };
  }

  // ─── 微信支付 ────────────────────────────────────────────────────────────
  if (PAYMENT_MODE === 'mock') {
    const result = await _markPaidAndAwardPoints(bookingId, booking, OPENID, 'wechat');
    return { success: true, mode: 'mock', amountDue, ...result };
  }

  // ─── 微信支付（生产模式）────────────────────────────────────────────────
  // TODO: 参考 payDeposit/index.js 实现
  // try {
  //   const outTradeNo = `${bookingId}_order_${Date.now()}`;
  //   const prepayId = await createWechatJsapiPrepay({ ...MCH_CONFIG,
  //     description: '服务费', outTradeNo, amountFen: amountDue * 100, openid: OPENID });
  //   const payParams = buildPayParams(MCH_CONFIG, prepayId);
  //   return { success: true, mode: 'wechat', payParams, amountDue };
  // } catch (e) {
  //   return { success: false, error: '微信支付下单失败，请重试' };
  // }
  return { success: false, error: '微信支付尚未配置，请联系管理员' };
};
