const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 添加客情互动记录
 * event: { targetUserId, mood, content, preferences }
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  let caller;
  try {
    const res = await db.collection('users').doc(OPENID).get();
    caller = res.data;
  } catch (e) {
    return { success: false, error: '用户不存在' };
  }
  if (caller.role !== 'admin' && caller.role !== 'technician') {
    return { success: false, error: '无权限' };
  }

  const { targetUserId, mood, content, preferences } = event;
  if (!targetUserId || !content) return { success: false, error: '缺少参数' };

  try { await db.createCollection('crmLogs'); } catch (e) {}

  const log = {
    userId:    targetUserId,
    staffId:   OPENID,
    staffName: caller.nickname || '店员',
    mood:      mood || 'normal',
    content,
    createdAt: db.serverDate(),
    dateStr:   event.clientDate || new Date().toISOString().slice(0, 10),
  };

  const res = await db.collection('crmLogs').add({ data: log });
  return { success: true, logId: res._id, log };
};
