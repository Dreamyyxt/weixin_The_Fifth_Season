const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 设置技师排班
 * event: { techId, date, isWorking, slots?: string[], updatedBy }
 * slots: 工作时段数组，如 ['10:00','10:30','11:00',...]，null 表示全天
 */
exports.main = async (event, context) => {
  const { techId, date, dates, isWorking, workStart, workEnd, slots, updatedBy } = event;

  if (!techId) return { success: false, error: 'missing techId' };

  const datesArr = dates || (date ? [date] : []);
  if (!datesArr.length) return { success: false, error: 'missing date(s)' };

  // 确保集合存在
  try { await db.createCollection('techSchedules'); } catch (e) { /* 已存在，忽略 */ }

  const updatedAt = new Date();

  try {
    for (const d of datesArr) {
      const docId = `${techId}_${d}`;
      await db.collection('techSchedules').doc(docId).set({
        data: {
          techId,
          date: d,
          isWorking: isWorking !== false,
          workStart: workStart || null,
          workEnd:   workEnd   || null,
          slots: slots || null,
          updatedBy: updatedBy || 'admin',
          updatedAt,
        },
      });
    }
    return { success: true };
  } catch (e) {
    console.error('setSchedule error:', e);
    return { success: false, error: e.message };
  }
};
