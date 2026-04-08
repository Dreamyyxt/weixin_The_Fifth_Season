const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const MEMBER_TIERS = [
  { level: 0, name: '普通会员', minSpend: 0,     pointsMultiplier: 1 },
  { level: 1, name: '银卡会员', minSpend: 500,   pointsMultiplier: 2 },
  { level: 2, name: '金卡会员', minSpend: 2000,  pointsMultiplier: 3 },
  { level: 3, name: '铂金会员', minSpend: 5000,  pointsMultiplier: 4 },
  { level: 4, name: '黑金会员', minSpend: 10000, pointsMultiplier: 5 },
  { level: 5, name: '钻石会员', minSpend: 20000, pointsMultiplier: 6 },
];

function calcTier(totalSpend) {
  let tier = MEMBER_TIERS[0];
  for (const t of MEMBER_TIERS) {
    if ((totalSpend || 0) >= t.minSpend) tier = t;
  }
  return tier;
}

async function awardSpendPoints(booking) {
  const customerOpenId = booking._openid;
  if (!customerOpenId || !booking.finalPrice) return;
  try {
    const userRes = await db.collection('users').doc(customerOpenId).get();
    const user = userRes.data;
    const oldTotalSpend = user.totalSpend || 0;
    const newTotalSpend = oldTotalSpend + booking.finalPrice;
    const userBalance   = user.balance   || 0;
    const oldTier       = calcTier(oldTotalSpend + userBalance);
    const newTier       = calcTier(newTotalSpend + userBalance);
    const pointsEarned  = Math.floor(booking.finalPrice / 10) * oldTier.pointsMultiplier;

    const userUpdate = {
      totalSpend:  _.inc(booking.finalPrice),
      memberLevel: newTier.level,
      vipLevel:    newTier.name,
    };
    if (pointsEarned > 0) userUpdate.points = _.inc(pointsEarned);
    await db.collection('users').doc(customerOpenId).update({ data: userUpdate });

    if (pointsEarned > 0) {
      await db.collection('pointsLogs').add({
        data: {
          _openid:   customerOpenId,
          userId:    customerOpenId,
          type:      'earn',
          desc:      `消费积分（${booking.serviceName || '服务'}）`,
          points:    pointsEarned,
          amount:    booking.finalPrice,
          createdAt: db.serverDate(),
        },
      });
    }
  } catch (e) {
    console.error('awardSpendPoints failed', e);
  }
}

/**
 * 更新预约状态
 * event: { bookingId, status: 'confirmed'|'completed'|'cancelled'|'pending', note? }
 * - 管理员：可更新任意预约
 * - 技师：只能更新自己的预约
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { bookingId, status, note, depositStatus, finalPrice, paymentMethod, paymentNote } = event;

  if (!bookingId || (!status && !depositStatus && !paymentMethod)) {
    return { success: false, error: '缺少必要参数' };
  }

  if (status) {
    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return { success: false, error: '无效状态' };
    }
  }
  if (depositStatus) {
    const validDepositStatuses = ['none', 'pending', 'paid', 'refunded', 'forfeited'];
    if (!validDepositStatuses.includes(depositStatus)) {
      return { success: false, error: '无效定金状态' };
    }
  }

  // 验证调用者权限
  let user;
  try {
    const res = await db.collection('users').doc(OPENID).get();
    user = res.data;
  } catch (e) {
    return { success: false, error: '用户不存在' };
  }

  const role = user?.role || 'customer';
  if (role !== 'admin' && role !== 'technician') {
    return { success: false, error: '权限不足' };
  }

  // 获取预约记录
  let booking;
  try {
    const res = await db.collection('bookings').doc(bookingId).get();
    booking = res.data;
  } catch (e) {
    return { success: false, error: '预约不存在' };
  }

  // 技师只能操作自己的预约
  if (role === 'technician' && booking.techId !== user.linkedTechId) {
    return { success: false, error: '只能管理自己的预约' };
  }

  const updateData = { updatedAt: db.serverDate() };
  if (status)              updateData.status        = status;
  if (note !== undefined)  updateData.adminNote     = note;
  if (depositStatus)       updateData.depositStatus = depositStatus;

  // 标记完成：记录实际完成时间（用于动态释放技师排班）
  if (status === 'completed') {
    const now = new Date(Date.now() + 8 * 60 * 60 * 1000); // CST
    const hh  = String(now.getUTCHours()).padStart(2, '0');
    const mm  = String(now.getUTCMinutes()).padStart(2, '0');
    updateData.actualEndTime = `${hh}:${mm}`;
  }

  // 标记完成：记录金额，收款状态设为待支付（定金已全额覆盖时除外）
  let depositFullyCovered = false;
  if (status === 'completed' && finalPrice !== undefined) {
    updateData.finalPrice = Number(finalPrice) || 0;
    const depositCover    = booking.depositStatus === 'paid' ? (booking.depositAmount || 0) : 0;
    const isPaid          = updateData.finalPrice <= depositCover;
    updateData.paymentStatus = isPaid ? 'paid' : 'unpaid';
    if (isPaid) depositFullyCovered = true;
  }

  // 管理员手动确认收款（独立操作，不改变 status）
  let offlinePaymentConfirmed = false;
  if (paymentMethod && !status) {
    const validMethods = ['wechat', 'cash', 'card', 'alipay_offline'];
    if (!validMethods.includes(paymentMethod)) return { success: false, error: '无效收款方式' };
    updateData.paymentMethod     = paymentMethod;
    updateData.paymentStatus     = 'paid';
    updateData.paymentRecordedBy = OPENID;
    updateData.paymentRecordedAt = db.serverDate();
    if (paymentNote !== undefined) updateData.paymentNote = paymentNote;
    offlinePaymentConfirmed = true;
  }

  await db.collection('bookings').doc(bookingId).update({ data: updateData });

  // 确认付款后更新累计消费 + 积分 + 会员等级
  if (depositFullyCovered || offlinePaymentConfirmed) {
    const paidBooking = { ...booking, finalPrice: updateData.finalPrice ?? booking.finalPrice };
    await awardSpendPoints(paidBooking);
  }

  // 预约确认时发送订阅消息通知客户
  if (status === 'confirmed' && booking._openid) {
    try {
      await cloud.callFunction({
        name: 'sendSubscribeMsg',
        data: {
          openId:      booking._openid,
          serviceName: booking.serviceName,
          date:        booking.date,
          time:        booking.time,
          techName:    booking.techName,
        },
      });
    } catch (e) {
      console.error('sendSubscribeMsg call failed:', e);
    }
  }

  return { success: true, bookingId, status };
};
