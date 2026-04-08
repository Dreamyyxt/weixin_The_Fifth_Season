const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

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

  const { userId } = event;
  if (!userId) return { success: false, error: '缺少参数' };

  try {
    const allLogs = [];
    let skip = 0;
    while (true) {
      const res = await db.collection('pointsLogs')
        .where({ userId, type: 'topup' })
        .orderBy('createdAt', 'desc')
        .skip(skip)
        .limit(100)
        .get();
      if (!res.data || res.data.length === 0) break;
      allLogs.push(...res.data);
      if (res.data.length < 100) break;
      skip += 100;
    }
    return { success: true, logs: allLogs };
  } catch (e) {
    return { success: true, logs: [] };
  }
};
