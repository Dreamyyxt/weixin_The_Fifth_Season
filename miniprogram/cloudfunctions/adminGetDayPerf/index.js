const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 今日业绩明细（按技师拆分）
 * event: { date?: 'YYYY-MM-DD' }
 *
 * 业绩口径：
 *   现金业绩 — 当日已完成 + 已付款，支付方式为微信/现金的订单（paymentMethod !== 'balance'）
 *   耗卡业绩 — 当日已完成 + 已付款，支付方式为余额扣款的订单（paymentMethod === 'balance'）
 *   充卡/续卡/产品业绩 — 需在对应环节记录经办技师后方可统计，暂返回 null
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const date   = event.date || event.clientDate || todayStr();
  // techId: 技师只查自己；不传则管理员看全店
  const techId = event.techId || null;

  // 权限校验：管理员可看全店，技师只能看自己
  let user;
  try {
    const res = await db.collection('users').doc(OPENID).get();
    user = res.data;
  } catch (e) {
    return { success: false, error: '用户不存在' };
  }
  const role = user?.role || 'customer';
  if (role !== 'admin' && role !== 'technician') return { success: false, error: '权限不足' };
  // 技师只能查自己的 techId
  if (role === 'technician' && techId && techId !== user.linkedTechId) {
    return { success: false, error: '无权查看其他技师数据' };
  }

  // 构造查询条件
  const query = { date, status: 'completed', paymentStatus: 'paid' };
  if (techId) query.techId = techId;

  // 查询当日已完成且已付款的预约
  let bookings = [];
  try {
    const res = await db.collection('bookings')
      .where(query)
      .limit(100)
      .get();
    bookings = res.data;
  } catch (e) {
    return { success: false, error: '数据查询失败' };
  }

  // 按技师聚合
  const techMap = {};
  let totalCash = 0;
  let totalCard = 0;

  for (const b of bookings) {
    const techId   = b.techId   || '__unknown__';
    const techName = b.techName || '未知技师';

    if (!techMap[techId]) {
      techMap[techId] = { techId, techName, cashRevenue: 0, cardRevenue: 0, bookingCount: 0 };
    }

    // 实收金额优先取 finalPrice，回退到 price
    const amount = (b.finalPrice !== undefined && b.finalPrice !== null)
      ? b.finalPrice
      : (b.price || 0);

    techMap[techId].bookingCount++;

    if (b.paymentMethod === 'balance') {
      techMap[techId].cardRevenue += amount;
      totalCard += amount;
    } else {
      techMap[techId].cashRevenue += amount;
      totalCash += amount;
    }
  }

  const techPerf = Object.values(techMap).sort(
    (a, b) => (b.cashRevenue + b.cardRevenue) - (a.cashRevenue + a.cardRevenue)
  );

  return {
    success: true,
    date,
    techPerf,
    totals: {
      cashRevenue: totalCash,
      cardRevenue: totalCard,
      total:       totalCash + totalCard,
    },
  };
};
