const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 设置用户角色（仅管理员可调用）
 * event: { targetOpenId, role: 'customer'|'technician'|'admin', linkedTechId? }
 *
 * 初始化说明：第一次使用时，在云开发控制台手动将你的用户文档里加上 role:'admin'
 * 之后就可以通过此云函数给他人分配角色。
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action, targetOpenId, role, linkedTechId, clearTechLink } = event;

  // 验证调用者是否为管理员
  let callerRole = 'customer';
  try {
    const res = await db.collection('users').doc(OPENID).get();
    callerRole = res.data?.role || 'customer';
  } catch (e) {}

  if (callerRole !== 'admin') {
    return { success: false, error: '权限不足，需要管理员权限' };
  }

  // 查询用户当前角色
  if (action === 'get') {
    if (!targetOpenId) return { success: false, error: '缺少目标用户 openId' };
    try {
      const res = await db.collection('users').doc(targetOpenId).get();
      return { success: true, role: res.data.role || 'customer', linkedTechId: res.data.linkedTechId || null };
    } catch (e) {
      return { success: false, error: '用户不存在，请确认 openId 正确' };
    }
  }

  const validRoles = ['customer', 'technician', 'admin'];
  if (!validRoles.includes(role)) {
    return { success: false, error: '无效角色' };
  }

  if (!targetOpenId) {
    return { success: false, error: '缺少目标用户 openId' };
  }

  // 验证目标用户存在
  try {
    await db.collection('users').doc(targetOpenId).get();
  } catch (e) {
    return { success: false, error: '目标用户不存在，请确认 openId 正确' };
  }

  const updateData = { role };

  if (clearTechLink) {
    // 明确取消关联
    updateData.linkedTechId = db.command.remove();
  } else if (linkedTechId) {
    // admin 和 technician 都支持关联技师档案
    updateData.linkedTechId = linkedTechId;
  } else if (role === 'customer') {
    // 降为普通用户时清除技师关联
    updateData.linkedTechId = db.command.remove();
  }
  // admin/technician 不传 linkedTechId 且不清除时，保留数据库中原有的关联

  await db.collection('users').doc(targetOpenId).update({ data: updateData });
  return { success: true, targetOpenId, role };
};
