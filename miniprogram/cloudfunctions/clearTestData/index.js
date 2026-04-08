const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 清理测试数据，上线前手动触发一次
 * ⚠️  高危操作！会删除以下集合的全部数据：
 *     users / bookings / posts / comments / likes / pointsLogs / redemptions
 *
 * 技师和商品数据（technicians / products）不会被删除，
 * 如需重置请重新触发 initData。
 *
 * 触发方式：在微信开发者工具 → 云函数 → clearTestData → 触发，
 * event 必须传 { "confirm": true } 作为安全开关，防止误触发。
 */

// 要清空的运行时集合（静态数据 technicians/products 保留）
const CLEAR_COLLECTIONS = [
  'users',
  'bookings',
  'posts',
  'comments',
  'likes',
  'pointsLogs',
  'redemptions',
];

/** 批量删除一个集合的所有文档，每次最多删 20 条（云函数限制） */
async function clearCollection(name) {
  let total = 0;
  while (true) {
    const res = await db.collection(name).limit(20).get();
    if (!res.data || res.data.length === 0) break;

    const ids = res.data.map(d => d._id);
    await Promise.all(ids.map(id => db.collection(name).doc(id).remove()));
    total += ids.length;
  }
  return total;
}

exports.main = async (event) => {
  // 安全开关：必须显式传 { confirm: true }，防止误触发
  if (!event || event.confirm !== true) {
    return {
      success: false,
      error: '请传入 { "confirm": true } 以确认执行清理操作',
    };
  }

  const report = {};
  for (const col of CLEAR_COLLECTIONS) {
    try {
      report[col] = await clearCollection(col);
    } catch (e) {
      report[col] = `错误: ${e.message}`;
    }
  }

  return {
    success: true,
    message: '测试数据已清理，请重新触发 initData 初始化静态数据',
    deleted: report,
  };
};
