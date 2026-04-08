const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function daysDiff(a, b) {
  return Math.floor((new Date(a) - new Date(b)) / 86400000);
}

function birthdayDaysFromNow(birthdayStr, todayStr) {
  if (!birthdayStr) return null;
  const [, mm, dd] = birthdayStr.split('-');
  const year = new Date(todayStr).getFullYear();
  const thisYear = new Date(`${year}-${mm}-${dd}`);
  let diff = Math.floor((thisYear - new Date(todayStr)) / 86400000);
  if (diff < -1) diff += 365;
  return diff;
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  // 优先用客户端本地日期，避免 UTC 跨日问题
  const todayStr     = event.clientDate || new Date().toISOString().slice(0, 10);
  const currentMonth = todayStr.slice(5, 7);

  let caller;
  try {
    const res = await db.collection('users').doc(OPENID).get();
    caller = res.data;
  } catch (e) {
    return { success: false, error: '用户不存在' };
  }
  if (caller.role !== 'admin') return { success: false, error: '无权限' };

  const cutoffDate = new Date(todayStr + 'T00:00:00');
  cutoffDate.setDate(cutoffDate.getDate() - 120);
  const cutoffStr = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth()+1).padStart(2,'0')}-${String(cutoffDate.getDate()).padStart(2,'0')}`;

  const [usersRes, bookingsRes] = await Promise.all([
    db.collection('users').limit(200).get(),
    db.collection('bookings')
      .where({ date: db.command.gte(cutoffStr), status: db.command.in(['confirmed', 'completed', 'paid']) })
      .orderBy('date', 'desc')
      .limit(1000)
      .get(),
  ]);

  const bookingsByUser = {};
  for (const b of bookingsRes.data) {
    const uid = b.userId || b._openid;
    if (!uid) continue;
    if (!bookingsByUser[uid]) bookingsByUser[uid] = [];
    bookingsByUser[uid].push(b);
  }

  const customers = [];

  for (const u of usersRes.data) {
    const uid = u._id;
    const userBookings = bookingsByUser[uid] || [];

    const lastBooking = userBookings.sort((a, b) => b.date.localeCompare(a.date))[0];
    const lastVisitDate = lastBooking?.date || null;
    const daysSinceVisit = lastVisitDate ? daysDiff(todayStr, lastVisitDate) : null;

    const serviceCount = {};
    for (const b of userBookings) {
      const name = b.serviceName || '';
      serviceCount[name] = (serviceCount[name] || 0) + 1;
    }
    const favoriteService = Object.entries(serviceCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    const birthdayDays = birthdayDaysFromNow(u.birthday, todayStr);
    const birthdayMonth = u.birthday ? u.birthday.split('-')[1] : null;

    const completedBookings = userBookings.filter(b => b.status === 'completed' || b.status === 'paid');
    const lastCompletedDate = completedBookings[0]?.date || null;
    const daysSinceCompleted = lastCompletedDate ? daysDiff(todayStr, lastCompletedDate) : null;

    const alerts = [];

    // 生日：本月生日
    if (birthdayMonth && birthdayMonth === currentMonth) {
      const label = birthdayDays === 0 ? '🎂 今天生日' : birthdayDays > 0 ? `🎂 ${birthdayDays}天后生日` : '🎂 本月生日';
      alerts.push({ type: 'birthday', label, priority: 1 });
    }

    // 首单回访：首单完成后 1-5 天
    if (daysSinceCompleted !== null && daysSinceCompleted >= 1 && daysSinceCompleted <= 5 && completedBookings.length === 1) {
      alerts.push({ type: 'first_order_followup', label: '🌟 首单回访', priority: 2 });
    }

    // 回访提醒：完成订单 3-10 天
    if (daysSinceCompleted !== null && daysSinceCompleted >= 3 && daysSinceCompleted <= 10 && completedBookings.length > 1) {
      alerts.push({ type: 'followup', label: '💬 待回访', priority: 3 });
    }

    // 睫毛补做：含"睫毛"/"嫁接"，距今 21-35 天
    const lastLashBooking = userBookings.find(b => b.serviceName && (b.serviceName.includes('睫毛') || b.serviceName.includes('嫁接')));
    if (lastLashBooking) {
      const d = daysDiff(todayStr, lastLashBooking.date);
      if (d >= 21 && d <= 35) alerts.push({ type: 'lash_refill', label: '👁️ 睫毛该补了', priority: 3 });
    }

    // 美甲补做：含"美甲"/"凝胶"/"高定"，距今 28-45 天
    const lastNailBooking = userBookings.find(b => b.serviceName && (b.serviceName.includes('美甲') || b.serviceName.includes('凝胶') || b.serviceName.includes('高定')));
    if (lastNailBooking) {
      const d = daysDiff(todayStr, lastNailBooking.date);
      if (d >= 28 && d <= 45) alerts.push({ type: 'nail_refill', label: '💅 美甲该补了', priority: 3 });
    }

    // 美脚补做：含"美脚"/"足"，距今 28-45 天
    const lastPediBooking = userBookings.find(b => b.serviceName && (b.serviceName.includes('美脚') || b.serviceName.includes('足')));
    if (lastPediBooking) {
      const d = daysDiff(todayStr, lastPediBooking.date);
      if (d >= 28 && d <= 45) alerts.push({ type: 'pedi_refill', label: '🦶 美脚该补了', priority: 3 });
    }

    // 流失预警：45-90 天未到店
    if (daysSinceVisit !== null && daysSinceVisit > 45 && daysSinceVisit <= 90) {
      alerts.push({ type: 'lapsing', label: `⚠️ ${daysSinceVisit}天未到店`, priority: 4 });
    }

    // 余额闲置：有余额但 60 天没来
    if ((u.balance || 0) > 0 && daysSinceVisit !== null && daysSinceVisit > 60) {
      alerts.push({ type: 'balance_idle', label: `💰 余额¥${u.balance}待用`, priority: 4 });
    }

    // 沉睡：超过 90 天未到店 或 从未到店
    if (daysSinceVisit === null || daysSinceVisit > 90) {
      const label = daysSinceVisit === null ? '😴 从未到店' : `😴 沉睡${daysSinceVisit}天`;
      alerts.push({ type: 'dormant', label, priority: 5 });
    }

    customers.push({
      _id:              uid,
      nickname:         u.nickname || '未设置昵称',
      avatarUrl:        u.avatarUrl || '',
      phone:            u.phone || '',
      gender:           u.gender || '',
      birthday:         u.birthday || '',
      memberNo:         u.memberNo || '',
      vipLevel:         u.vipLevel || '普通会员',
      totalSpend:       u.totalSpend || 0,
      balance:          u.balance || 0,
      points:           u.points || 0,
      tags:             u.tags || [],
      crmNotes:         u.crmNotes || '',
      stylePrefs:       u.stylePrefs || [],
      priceSensitivity: u.priceSensitivity || '',
      techPreference:   u.techPreference || '',
      timePreference:   u.timePreference || '',
      bookingCount:     userBookings.length,
      lastVisitDate,
      daysSinceVisit,
      favoriteService,
      birthdayDays,
      alerts: alerts.sort((a, b) => a.priority - b.priority),
    });
  }

  customers.sort((a, b) => {
    const ap = a.alerts[0]?.priority ?? 99;
    const bp = b.alerts[0]?.priority ?? 99;
    return ap - bp;
  });

  return { success: true, customers };
};
