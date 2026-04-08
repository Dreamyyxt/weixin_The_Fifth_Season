const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 技师管理（CRUD）
 * event: {
 *   action: 'save' | 'delete' | 'toggleAvailable'
 *   tech: { _id?, name, title, avatar, skills, priceFrom, desc, badge, available, order }
 * }
 * - 管理员：可操作任意技师
 * - 技师：只能编辑自己关联的技师档案（限 save 操作，不可删除）
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action, tech } = event;

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

  // 技师只能编辑自己的档案，不能删除
  if (role === 'technician') {
    if (action !== 'save') return { success: false, error: '技师只能编辑自己的资料' };
    if (tech?._id !== user.linkedTechId) return { success: false, error: '只能编辑自己的档案' };
  }

  if (action === 'delete') {
    if (!tech?._id) return { success: false, error: '缺少技师 ID' };
    await db.collection('technicians').doc(tech._id).remove();
    return { success: true };
  }

  if (action === 'toggleAvailable') {
    if (!tech?._id) return { success: false, error: '缺少技师 ID' };
    const res = await db.collection('technicians').doc(tech._id).get();
    const current = res.data.available;
    await db.collection('technicians').doc(tech._id).update({ data: { available: !current } });
    return { success: true, available: !current };
  }

  if (action === 'save') {
    if (!tech) return { success: false, error: '缺少技师数据' };
    const { _id, ...data } = tech;

    // 保证字段类型正确
    if (data.skills && typeof data.skills === 'string') {
      data.skills = data.skills.split(',').map(s => s.trim()).filter(Boolean);
    }
    data.priceFrom = Number(data.priceFrom) || 0;
    data.order     = Number(data.order) || 99;

    if (_id) {
      await db.collection('technicians').doc(_id).update({ data });
      return { success: true, techId: _id };
    } else {
      const result = await db.collection('technicians').add({ data });
      return { success: true, techId: result._id };
    }
  }

  return { success: false, error: '未知操作' };
};
