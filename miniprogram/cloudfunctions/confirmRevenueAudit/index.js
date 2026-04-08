const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 管理员对某日营收进行对账确认
 * event: { date, cashActual, note }
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  let user;
  try {
    const res = await db.collection('users').doc(OPENID).get();
    user = res.data;
  } catch (e) {
    return { success: false, error: '用户不存在' };
  }
  if (user?.role !== 'admin') return { success: false, error: '权限不足' };

  const { date, cashActual, note } = event;
  if (!date) return { success: false, error: '缺少日期' };

  // 检查是否已存在
  const existing = await db.collection('revenueAudits').where({ date }).limit(1).get();
  const auditData = {
    date,
    cashActual: Number(cashActual) || 0,
    note: note || '',
    confirmedBy: OPENID,
    confirmedAt: db.serverDate(),
  };

  if (existing.data.length > 0) {
    await db.collection('revenueAudits').doc(existing.data[0]._id).update({ data: auditData });
  } else {
    await db.collection('revenueAudits').add({ data: auditData });
  }

  return { success: true };
};
