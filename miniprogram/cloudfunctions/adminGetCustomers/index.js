const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 获取客户列表（仅管理员）
 * event: { search?: string }
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
  if (caller.role !== 'admin') return { success: false, error: '无权限' };

  const { search = '' } = event;

  const res = await db.collection('users').orderBy('createdAt', 'desc').limit(100).get();

  let customers = res.data.map(u => ({
    _id:        u._id,
    name:       u.nickname   || u.name || '未设置昵称',
    phone:      u.phone      || '',
    tier:       u.tier       || 'bronze',
    balance:    u.balance    || 0,
    points:     u.points     || 0,
    totalSpend: u.totalSpend || 0,
  }));

  if (search) {
    const s = search.toLowerCase();
    customers = customers.filter(u =>
      u.name.toLowerCase().includes(s) || u.phone.includes(s)
    );
  }

  return { success: true, customers };
};
