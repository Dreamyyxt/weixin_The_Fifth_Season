const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 查询技师的时间段占用情况（云端执行，可读取所有预约记录）
 * event: { techId, date }         → 单个技师，返回 blocked[]
 *      | { techIds: [], date }    → 多个技师，返回各自 available 状态
 */

const ALL_TIME_SLOTS = [
  '11:00', '11:30', '12:00', '12:30',
  '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30', '20:00', '20:30',
  '21:00', '21:30', '22:00',
];

const MIN_SERVICE_DURATION = 60;            // 最短服务时长（分钟，去甲 60 min）
const BUSINESS_END_MIN     = 22 * 60;       // 22:00 正常营业结束
const MAX_END_MIN          = BUSINESS_END_MIN + 60; // 23:00 含加班上限

function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// 计算某组预约占用的时间段（返回时间字符串数组）
function calcBlockedSlots(bookings) {
  const blocked = new Set();
  for (const b of bookings) {
    const startMin = timeToMin(b.time);
    const durationMin = parseInt(String(b.duration || '60').match(/\d+/)?.[0] || '60');
    for (let t = startMin; t < startMin + durationMin; t += 30) {
      const h = String(Math.floor(t / 60)).padStart(2, '0');
      const m = String(t % 60).padStart(2, '0');
      blocked.add(`${h}:${m}`);
    }
  }
  return Array.from(blocked);
}

// 检查是否还有可用时间窗口（在营业时间内且无冲突，满足 durationMin）
function hasAvailableSlot(blockedArr, durationMin) {
  const blockedSet = new Set(blockedArr);

  for (const slot of ALL_TIME_SLOTS) {
    if (blockedSet.has(slot)) continue;

    const startMin = timeToMin(slot);
    const endMin = startMin + durationMin;

    if (endMin > MAX_END_MIN) continue;

    const hasConflict = ALL_TIME_SLOTS.some(s => {
      const sMin = timeToMin(s);
      return sMin >= startMin && sMin < endMin && blockedSet.has(s);
    });

    if (!hasConflict) return true;
  }
  return false;
}

exports.main = async (event, context) => {
  const { techId, techIds, date } = event;
  if (!date) return { success: false, error: 'missing date' };

  const ids = techIds || (techId ? [techId] : []);
  if (!ids.length) return { success: false, error: 'missing techId(s)' };

  // 查询该日期这些技师的所有非取消预约（云函数有管理员权限）
  const whereClause = {
    date,
    techId: ids.length === 1 ? ids[0] : _.in(ids),
  };

  let activeBookings = [];
  try {
    const res = await db.collection('bookings').where(whereClause).limit(200).get();
    activeBookings = res.data.filter(b => b.status !== 'cancelled');
  } catch (e) {
    // 集合不存在或为空，正常继续
  }

  // 按技师分组
  const byTech = {};
  for (const id of ids) byTech[id] = [];
  for (const b of activeBookings) {
    if (byTech[b.techId]) byTech[b.techId].push(b);
  }

  // 多技师模式：返回每个技师的 available 状态
  if (techIds) {
    const result = {};
    for (const id of ids) {
      const blocked = calcBlockedSlots(byTech[id]);
      result[id] = { available: hasAvailableSlot(blocked, MIN_SERVICE_DURATION) };
    }
    return { success: true, result };
  }

  // 单技师模式：返回 blocked 时间段列表
  const blocked = calcBlockedSlots(byTech[techId]);
  return {
    success: true,
    blocked,
    available: hasAvailableSlot(blocked, MIN_SERVICE_DURATION),
  };
};
