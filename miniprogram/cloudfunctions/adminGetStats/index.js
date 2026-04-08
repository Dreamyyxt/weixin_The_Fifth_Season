const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _  = db.command;
const $  = db.command.aggregate;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoFromDate(baseDate, n) {
  const d = new Date(baseDate + 'T00:00:00');
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Build an array of all date strings between startDate and endDate (inclusive)
function dateRange(startDate, endDate) {
  const result = [];
  const d = new Date(startDate);
  const end = new Date(endDate);
  while (d <= end) {
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return result;
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const chartRange = event.chartRange || 7;
  // mode: 'admin' | 'technician' — admin 用户可指定以技师身份查看工作台
  const mode = event.mode || null;

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

  // 优先用客户端传来的本地日期，避免 UTC 与 UTC+8 跨日问题
  const today = event.clientDate || todayStr();

  // ─── 管理员视图 ───────────────────────────────────────────────────────────
  // 若 admin 用户指定 mode: 'technician'，则跳过管理员视图，进入技师视图
  if (role === 'admin' && mode !== 'technician') {
    // Support explicit date range (custom) or chartRange (7/30 days)
    const startDate = event.startDate || daysAgoFromDate(today, chartRange - 1);
    const endDate   = event.endDate   || today;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Today's bookings (for pie charts + today stats)
    const [todayAllRes, pendingRes, userCountRes, newUserRes] = await Promise.all([
      db.collection('bookings').where({ date: today }).limit(100).get(),
      db.collection('bookings').where({ status: 'pending' }).count(),
      db.collection('users').count(),
      db.collection('users').where({ createdAt: _.gte(todayStart) }).count(),
    ]);

    // Daily stats via aggregation pipeline — no document count limit, handles large ranges
    const aggRes = await db.collection('bookings')
      .aggregate()
      .match({ date: _.gte(startDate).and(_.lte(endDate)) })
      .group({
        _id:            '$date',
        bookingCount:   $.sum(1),
        completedCount: $.sum($.cond({ if: $.eq(['$status', 'completed']), then: 1, else: 0 })),
        cancelledCount: $.sum($.cond({ if: $.eq(['$status', 'cancelled']), then: 1, else: 0 })),
        // 营业额口径：已完成 + 客户已付款，取实际收款金额 finalPrice
        revenue:        $.sum($.cond({
          if:   $.and([$.eq(['$status', 'completed']), $.eq(['$paymentStatus', 'paid'])]),
          then: '$finalPrice',
          else: 0,
        })),
      })
      .end();

    // Build dailyMap covering every date in range (zero-fill missing dates)
    const dailyMap = {};
    dateRange(startDate, endDate).forEach(date => {
      dailyMap[date] = { date, bookingCount: 0, completedCount: 0, cancelledCount: 0, revenue: 0 };
    });
    (aggRes.list || []).forEach(item => {
      if (dailyMap[item._id]) {
        dailyMap[item._id].bookingCount   = item.bookingCount   || 0;
        dailyMap[item._id].completedCount = item.completedCount || 0;
        dailyMap[item._id].cancelledCount = item.cancelledCount || 0;
        dailyMap[item._id].revenue        = item.revenue        || 0;
      }
    });
    const dailyStats = Object.values(dailyMap).sort((a, b) => (a.date < b.date ? -1 : 1));

    const todayCompleted     = todayAllRes.data.filter(b => b.status === 'completed');
    const todayPendingToday  = todayAllRes.data.filter(b => b.status === 'pending');
    const todayConfirmed     = todayAllRes.data.filter(b => b.status === 'confirmed');
    const todayCancelled     = todayAllRes.data.filter(b => b.status === 'cancelled');
    // 营业额口径：已完成 + 已付款，取 finalPrice
    const todayPaid    = todayCompleted.filter(b => b.paymentStatus === 'paid');
    const todayRevenue = todayPaid.reduce((sum, b) => sum + (b.finalPrice || 0), 0);

    // Per-tech stats from today's bookings (for pie charts)
    const techMap = {};
    todayAllRes.data.forEach(b => {
      const key = b.techId || 'unknown';
      if (!techMap[key]) techMap[key] = { techId: key, name: b.techName || '未知', bookingCount: 0, revenue: 0 };
      techMap[key].bookingCount++;
      if (b.status === 'completed' && b.paymentStatus === 'paid') {
        techMap[key].revenue += b.finalPrice || 0;
      }
    });

    return {
      success:        true,
      role,
      todayCount:        todayAllRes.data.length,
      todayPendingCount: todayPendingToday.length,
      todayConfirmed:    todayConfirmed.length,
      todayCompleted:    todayCompleted.length,
      todayCancelled:    todayCancelled.length,
      todayRevenue,
      pendingCount:   pendingRes.total,
      userCount:      userCountRes.total,
      newUserCount:   newUserRes.total,
      techStats:      Object.values(techMap),
      dailyStats,
    };
  }

  // ─── 技师视图（含以技师模式访问的 admin 用户）────────────────────────────
  const techId = user.linkedTechId;
  if (!techId) return { success: true, role: 'technician', todayBookings: [], todayRevenue: 0, linkedTechId: null };

  const res = await db.collection('bookings')
    .where({ techId, date: today })
    .orderBy('time', 'asc')
    .get();

  const todayRevenue = res.data
    .filter(b => b.status === 'completed' && b.paymentStatus === 'paid')
    .reduce((sum, b) => sum + (b.finalPrice || 0), 0);

  return {
    success:       true,
    role:          'technician',   // 统一返回 'technician'，客户端按此渲染
    linkedTechId:  techId,
    todayBookings: res.data,
    todayRevenue,
  };
};
