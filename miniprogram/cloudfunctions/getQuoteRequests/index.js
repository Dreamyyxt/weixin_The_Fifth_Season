const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  try {
    const userRes = await db.collection('users').doc(OPENID).get();
    const { role } = userRes.data;
    if (!['owner', 'admin', 'technician'].includes(role)) return { success: false, error: '无权限' };
  } catch (e) {
    return { success: false, error: '无权限' };
  }

  const { status } = event;
  try {
    const query = status
      ? db.collection('quoteRequests').where({ status })
      : db.collection('quoteRequests').where({ status: _.in(['pending', 'quoted']) });

    const res = await query.orderBy('createdAt', 'desc').limit(100).get();
    return { success: true, quotes: res.data };
  } catch (e) {
    return { success: false, error: e.message };
  }
};
