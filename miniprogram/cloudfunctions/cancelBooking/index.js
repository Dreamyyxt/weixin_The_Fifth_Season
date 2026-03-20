const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 取消预约
 * event: { bookingId }
 * 仅允许预约创建者本人取消
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { bookingId } = event;

  if (!bookingId) return { success: false, error: '缺少 bookingId' };

  let booking;
  try {
    const res = await db.collection('bookings').doc(bookingId).get();
    booking = res.data;
  } catch (e) {
    return { success: false, error: '预约记录不存在' };
  }

  if (booking._openid !== OPENID) {
    return { success: false, error: '无权操作' };
  }

  if (booking.status === 'cancelled') {
    return { success: false, error: '该预约已取消' };
  }

  // Determine deposit outcome
  const wasConfirmed   = booking.status === 'confirmed';
  const depositWasPaid = booking.depositStatus === 'paid';
  const hasDeposit     = booking.depositRequired && depositWasPaid;
  const updateData     = { status: 'cancelled', updatedAt: db.serverDate() };
  if (hasDeposit) {
    updateData.depositStatus = wasConfirmed ? 'forfeited' : 'refunded';
  }

  await db.collection('bookings').doc(bookingId).update({ data: updateData });

  // 退款：未确认预约取消 + 定金已付 + 余额支付 → 原路退回余额
  let depositRefunded = false;
  const depositAmount = booking.depositAmount || 0;
  if (!wasConfirmed && hasDeposit && booking.depositPaymentMethod === 'balance' && depositAmount > 0) {
    await db.collection('users').doc(OPENID).update({
      data: { balance: _.inc(depositAmount) },
    });
    depositRefunded = true;
  }

  return {
    success:          true,
    depositForfeited: wasConfirmed && hasDeposit,
    depositRefunded,
    depositRefundAmount: depositRefunded ? depositAmount : 0,
  };
};
