const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 查询预约列表（服务端执行，绕过客户端 _openid 安全规则）
 * event: { dateFilter?, statusFilter? }
 *
 * - admin：可查看所有预约
 * - technician：查看"客户预约我"的单 + "我自己作为客户"的单（两者合并去重）
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { dateFilter, dateFrom, dateTo, statusFilter, techId } = event;
  const _ = db.command;

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

  const baseFilter = {};
  if (dateFilter) {
    baseFilter.date = dateFilter;
  } else if (dateFrom || dateTo) {
    let dateCmd = _.exists(true);
    if (dateFrom && dateTo) dateCmd = _.gte(dateFrom).and(_.lte(dateTo));
    else if (dateFrom)      dateCmd = _.gte(dateFrom);
    else                    dateCmd = _.lte(dateTo);
    baseFilter.date = dateCmd;
  }
  if (statusFilter && statusFilter !== 'all') baseFilter.status = statusFilter;

  let bookings;

  if (role === 'technician') {
    const linkedTechId = user.linkedTechId;

    if (linkedTechId) {
      // 只显示客户预约我的单
      const res = await db.collection('bookings').where({ ...baseFilter, techId: linkedTechId }).limit(100).get();
      bookings = res.data;
    } else {
      bookings = [];
    }

    // 按日期升序、时间升序排序（最近的预约排前）
    bookings.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.time < b.time ? -1 : 1;
    });

  } else {
    // admin：查看全部（若传入 techId 则按技师过滤）
    const adminFilter = { ...baseFilter };
    if (techId) adminFilter.techId = techId;
    const res = await db.collection('bookings')
      .where(adminFilter)
      .orderBy('date', 'desc')
      .orderBy('time', 'asc')
      .limit(100)
      .get();
    bookings = res.data;
  }

  return {
    success:      true,
    role,
    linkedTechId: user.linkedTechId || null,
    bookings,
  };
};
