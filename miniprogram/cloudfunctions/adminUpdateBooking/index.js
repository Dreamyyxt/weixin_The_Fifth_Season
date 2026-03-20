const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 更新预约状态
 * event: { bookingId, status: 'confirmed'|'completed'|'cancelled'|'pending', note? }
 * - 管理员：可更新任意预约
 * - 技师：只能更新自己的预约
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { bookingId, status, note, depositStatus, finalPrice } = event;

  if (!bookingId || (!status && !depositStatus)) {
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

  // When marking as completed, record the final price and set payment status
  if (status === 'completed' && finalPrice !== undefined) {
    updateData.finalPrice     = Number(finalPrice) || 0;
    // If finalPrice is fully covered by deposit, auto-mark as paid
    const depositCover = booking.depositStatus === 'paid' ? (booking.depositAmount || 0) : 0;
    updateData.paymentStatus  = updateData.finalPrice <= depositCover ? 'paid' : 'unpaid';
  }

  await db.collection('bookings').doc(bookingId).update({ data: updateData });
  return { success: true, bookingId, status };
};
