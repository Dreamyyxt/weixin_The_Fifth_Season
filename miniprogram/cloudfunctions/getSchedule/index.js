const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 查询技师排班数据（云端执行，绕过客户端权限限制）
 *
 * 模式一：单技师月份区间
 *   event: { techId, dateFrom, dateTo }
 *   returns: { success, schedules: [...] }
 *
 * 模式二：某一天所有技师
 *   event: { date }
 *   returns: { success, schedules: [...] }
 */
exports.main = async (event, context) => {
  const { techId, dateFrom, dateTo, date } = event;

  try {
    let whereClause;
    let limit = 100;

    if (date && !techId) {
      // 模式二：查某天全部技师排班
      whereClause = { date };
    } else if (!techId && dateFrom) {
      // 模式三：查日期范围内所有技师排班（用于周/月视图）
      whereClause = dateTo
        ? { date: _.gte(dateFrom).and(_.lte(dateTo)) }
        : { date: _.gte(dateFrom) };
      limit = 500;
    } else if (techId && dateFrom) {
      // 模式一：查单技师日期范围
      whereClause = dateTo
        ? { techId, date: _.gte(dateFrom).and(_.lte(dateTo)) }
        : { techId, date: _.gte(dateFrom) };
    } else {
      return { success: false, error: 'missing params', schedules: [] };
    }

    const res = await db.collection('techSchedules')
      .where(whereClause)
      .limit(limit)
      .get();

    return { success: true, schedules: res.data };
  } catch (e) {
    console.error('getSchedule error:', e);
    return { success: false, error: e.message, schedules: [] };
  }
};
