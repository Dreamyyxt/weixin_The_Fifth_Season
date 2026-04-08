const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const PAY_METHODS = ['wechat', 'cash', 'card', 'alipay_offline'];
const PAY_LABEL   = { wechat: '微信支付', cash: '现金', card: '刷卡', alipay_offline: '支付宝' };

/**
 * event: { date } | { dateFrom, dateTo }
 * returns: { success, summary: { total, byMethod }, bookings, auditConfirmed }
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  // 验证管理员权限
  let user;
  try {
    const res = await db.collection('users').doc(OPENID).get();
    user = res.data;
  } catch (e) {
    return { success: false, error: '用户不存在' };
  }
  if (user?.role !== 'admin') return { success: false, error: '权限不足' };

  const { date, dateFrom, dateTo } = event;
  let whereDate;
  if (date) {
    whereDate = { date };
  } else if (dateFrom && dateTo) {
    whereDate = { date: _.gte(dateFrom).and(_.lte(dateTo)) };
  } else {
    return { success: false, error: '缺少日期参数' };
  }

  let bookings = [];
  try {
    const res = await db.collection('bookings')
      .where({ ...whereDate, status: 'completed' })
      .orderBy('date', 'asc')
      .orderBy('time', 'asc')
      .limit(200)
      .get();
    bookings = res.data;
  } catch (e) {
    return { success: false, error: e.message };
  }

  // 汇总
  let total = 0;
  const byMethod = {};
  for (const m of PAY_METHODS) byMethod[m] = { label: PAY_LABEL[m], count: 0, amount: 0 };

  for (const b of bookings) {
    const amount = b.finalPrice !== undefined ? b.finalPrice : (b.price || 0);
    total += amount;
    const m = b.paymentMethod || 'cash';
    if (!byMethod[m]) byMethod[m] = { label: PAY_LABEL[m] || m, count: 0, amount: 0 };
    byMethod[m].count  += 1;
    byMethod[m].amount += amount;
  }

  // 查询当日是否已对账确认
  let auditConfirmed = null;
  try {
    const auditRes = await db.collection('revenueAudits')
      .where({ date: date || dateFrom })
      .limit(1)
      .get();
    if (auditRes.data.length > 0) auditConfirmed = auditRes.data[0];
  } catch (e) { /* 集合不存在时忽略 */ }

  return { success: true, summary: { total, byMethod }, bookings, auditConfirmed };
};
