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

const MIN_SERVICE_DURATION = 60;
const BUSINESS_END_MIN     = 22 * 60;
const MAX_END_MIN          = BUSINESS_END_MIN + 60;

function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** 当前 CST（UTC+8）分钟数 */
function nowMinCST() {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

function calcBlockedSlots(bookings) {
  const blocked = new Set();
  for (const b of bookings) {
    const startMin = timeToMin(b.time);
    // 如果已提前完成，用实际结束时间代替预计时长
    const endMin = b.actualEndTime
      ? timeToMin(b.actualEndTime)
      : startMin + (b.durationMin != null ? b.durationMin : parseInt(String(b.duration || '60').match(/\d+/)?.[0] || '60'));
    for (let t = startMin; t < endMin; t += 30) {
      const h = String(Math.floor(t / 60)).padStart(2, '0');
      const m = String(t % 60).padStart(2, '0');
      blocked.add(`${h}:${m}`);
    }
  }
  return Array.from(blocked);
}

function hasAvailableSlot(blockedArr, durationMin, currentMin) {
  const blockedSet = new Set(blockedArr);
  for (const slot of ALL_TIME_SLOTS) {
    const startMin = timeToMin(slot);
    if (currentMin !== undefined && startMin < currentMin) continue; // 过去的时段跳过
    if (blockedSet.has(slot)) continue;
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

/**
 * 将排班限制合并进 blocked 列表：
 * - 若有 slots 字段，不在 slots 内的时段全部 blocked
 * - 若只有 workStart/workEnd，不在工作时段内的全部 blocked
 */
function mergeScheduleSlots(bookingBlocked, schedDoc) {
  const merged = new Set(bookingBlocked);
  if (!schedDoc) return Array.from(merged);

  if (schedDoc.slots && schedDoc.slots.length > 0) {
    const workingSet = new Set(schedDoc.slots);
    for (const slot of ALL_TIME_SLOTS) {
      if (!workingSet.has(slot)) merged.add(slot);
    }
    return Array.from(merged);
  }

  // 用 workStart/workEnd 限制可预约范围
  if (schedDoc.workStart && schedDoc.workEnd) {
    const startMin = timeToMin(schedDoc.workStart);
    const endMin   = timeToMin(schedDoc.workEnd);
    for (const slot of ALL_TIME_SLOTS) {
      const slotMin = timeToMin(slot);
      if (slotMin < startMin || slotMin >= endMin) merged.add(slot);
    }
  }

  return Array.from(merged);
}

exports.main = async (event, context) => {
  const { techId, techIds, date } = event;
  if (!date) return { success: false, error: 'missing date' };

  const ids = techIds || (techId ? [techId] : []);
  if (!ids.length) return { success: false, error: 'missing techId(s)' };

  // 查询预约占用
  let activeBookings = [];
  try {
    const res = await db.collection('bookings').where({
      date,
      techId: ids.length === 1 ? ids[0] : _.in(ids),
    }).limit(200).get();
    activeBookings = res.data.filter(b => b.status !== 'cancelled');
  } catch (e) { /* 集合不存在或为空，正常继续 */ }

  // 按技师分组
  const byTech = {};
  for (const id of ids) byTech[id] = [];
  for (const b of activeBookings) {
    if (byTech[b.techId]) byTech[b.techId].push(b);
  }

  // 查询排班数据
  const scheduleMap = {};
  try {
    const schedRes = await db.collection('techSchedules')
      .where({ techId: ids.length === 1 ? ids[0] : _.in(ids), date })
      .limit(ids.length + 1)
      .get();
    for (const s of schedRes.data) {
      scheduleMap[s.techId] = s;
    }
  } catch (e) { /* 无排班数据，视为正常工作日 */ }

  const currentMin = nowMinCST();

  // 多技师模式：返回每个技师的 available 状态
  if (techIds) {
    const result = {};
    for (const id of ids) {
      const sched = scheduleMap[id];
      if (sched && sched.isWorking === false) {
        result[id] = { available: false, scheduleOff: true };
      } else {
        const bookingBlocked = calcBlockedSlots(byTech[id]);
        const blocked = mergeScheduleSlots(bookingBlocked, sched);
        result[id] = { available: hasAvailableSlot(blocked, MIN_SERVICE_DURATION, currentMin) };
      }
    }
    return { success: true, result };
  }

  // 单技师模式：返回 blocked 时间段列表
  const sched = scheduleMap[techId];
  if (sched && sched.isWorking === false) {
    return { success: true, blocked: ALL_TIME_SLOTS, available: false, scheduleOff: true };
  }
  const bookingBlocked = calcBlockedSlots(byTech[techId]);
  const blocked = mergeScheduleSlots(bookingBlocked, sched);
  return {
    success: true,
    blocked,
    available: hasAvailableSlot(blocked, MIN_SERVICE_DURATION, currentMin),
    scheduleOff: false,
  };
};
