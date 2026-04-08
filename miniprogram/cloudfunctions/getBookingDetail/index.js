const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 获取单个预约详情（服务端权限，可读取管理员创建的游客订单）
 * 仅返回属于当前用户的订单（userId 或 _openid 匹配）
 * event: { bookingId }
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { bookingId } = event;

  if (!bookingId) return { success: false, error: '缺少参数' };

  let booking;
  try {
    const res = await db.collection('bookings').doc(bookingId).get();
    booking = res.data;
  } catch (e) {
    return { success: false, error: '订单不存在' };
  }

  // 验证归属：userId 匹配，或 _openid 匹配（自助预约），或 role 为 admin/technician
  const isOwner = booking.userId === OPENID || booking._openid === OPENID;
  if (!isOwner) {
    // 检查是否是管理员或技师
    try {
      const userRes = await db.collection('users').doc(OPENID).get();
      const role = userRes.data?.role || 'customer';
      if (role !== 'admin' && role !== 'technician') {
        return { success: false, error: '无权查看此订单' };
      }
    } catch (e) {
      return { success: false, error: '无权查看此订单' };
    }
  }

  return { success: true, booking };
};
