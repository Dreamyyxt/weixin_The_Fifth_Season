const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 套餐 / 积分商品管理（仅管理员）
 * event: {
 *   action: 'save' | 'delete'
 *   pkg: { _id?, type, name, desc, emoji, tag, price?, points?, sold, stock,
 *           serviceId?, duration?, durationMin?, techIds?, features? }
 * }
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action, pkg } = event;

  let user;
  try {
    const res = await db.collection('users').doc(OPENID).get();
    user = res.data;
  } catch (e) {
    return { success: false, error: '用户不存在' };
  }

  if (user?.role !== 'admin') {
    return { success: false, error: '权限不足，仅管理员可操作套餐' };
  }

  if (action === 'delete') {
    if (!pkg?._id) return { success: false, error: '缺少套餐 ID' };
    await db.collection('products').doc(pkg._id).remove();
    return { success: true };
  }

  if (action === 'save') {
    if (!pkg) return { success: false, error: '缺少套餐数据' };
    const { _id, ...data } = pkg;

    // 类型转换
    if (data.price !== undefined && data.price !== null)  data.price  = Number(data.price);
    if (data.points !== undefined && data.points !== null) data.points = Number(data.points);
    if (data.stock !== undefined)  data.stock  = Number(data.stock) || 999;
    if (data.sold !== undefined)   data.sold   = Number(data.sold)  || 0;
    if (data.durationMin !== undefined) data.durationMin = Number(data.durationMin);
    if (data.serviceId !== undefined)   data.serviceId   = Number(data.serviceId);

    // features 从换行文本转数组
    if (data.features && typeof data.features === 'string') {
      data.features = data.features.split('\n').map(s => s.trim()).filter(Boolean);
    }
    // techIds 从逗号分隔字符串转数组
    if (data.techIds && typeof data.techIds === 'string') {
      data.techIds = data.techIds.split(',').map(s => s.trim()).filter(Boolean);
    }

    if (_id) {
      await db.collection('products').doc(_id).update({ data });
      return { success: true, pkgId: _id };
    } else {
      data.sold = data.sold || 0;
      const result = await db.collection('products').add({ data });
      return { success: true, pkgId: result._id };
    }
  }

  return { success: false, error: '未知操作' };
};
