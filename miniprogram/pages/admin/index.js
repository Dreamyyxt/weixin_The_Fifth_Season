const app = getApp();
const { drawPie, drawLine, CHART_COLORS } = require('../../utils/chartHelper');

const { statusBarHeight, windowWidth } = wx.getWindowInfo();
const NAV_TOP = statusBarHeight + 12;

// Time column width in rpx; scroll-view gets the rest in px
const TIME_COL_RPX  = 104;
const TIME_COL_PX   = Math.round(TIME_COL_RPX * windowWidth / 750);
const GANTT_SCROLL_W = windowWidth - TIME_COL_PX;

// ─── Schedule constants ───────────────────────────────────────────────────────
const DAY_START_H = 11;   // 11:00
const DAY_END_H   = 22;   // 22:00 exclusive (last slot = 21:30)
const SLOT_H      = 80;   // rpx per 30-min slot

const TECH_COLORS = ['#C8847A', '#6AAFCB', '#9B8FC0', '#5BBCAA', '#E0964A', '#A0B85A'];

const STATUS_LABEL = {
  pending:   '待确认',
  confirmed: '已确认',
  completed: '已完成',
  cancelled: '已取消',
};

const TIER_LABEL = {
  bronze:  '普通会员',
  silver:  '银卡会员',
  gold:    '金卡会员',
  diamond: '钻石会员',
};

const TIER_COLOR = {
  bronze:  '#A07058',
  silver:  '#7A8A9A',
  gold:    '#C9A76B',
  diamond: '#9B8FC0',
};

function _fmt(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
function _today() { return _fmt(new Date()); }
function _todayDisplay() {
  const d = new Date();
  return `${d.getFullYear()}年${String(d.getMonth()+1).padStart(2,'0')}月${String(d.getDate()).padStart(2,'0')}日`;
}
function _fmtMonthLabel(ymStr) {
  const [y, m] = ymStr.split('-');
  return `${y}年${m}月`;
}
function _fmtDateLabel(dateStr) {
  const dt = new Date(dateStr + 'T00:00:00');
  return `${dt.getMonth()+1}月${dt.getDate()}日`;
}

Page({
  data: {
    navTopPadding: NAV_TOP,
    loading: true,
    role: '',
    linkedTechId: '',

    // ── Admin bottom tab ─────────────────────────────────────────────────────
    adminTab: 'overview',

    // ── Overview ─────────────────────────────────────────────────────────────
    todayDateStr:   _todayDisplay(),
    todayCount:     0,
    todayCompleted: 0,
    todayRevenue:   0,
    pendingCount:   0,
    userCount:      0,
    newUserCount:   0,
    techStats:      [],
    dailyStats:     [],

    // ── Admin Schedule ────────────────────────────────────────────────────────
    scheduleViewType:   'day',   // 'day' | 'month' | 'year'
    scheduleDate:       '',
    scheduleWeekStart:  '',
    scheduleWeek:       [],
    gridLines:          [],
    timeSlots:          [],
    ganttScrollW:       GANTT_SCROLL_W,
    ganttTechs:         [],
    ganttLoading:       false,
    // Month view
    scheduleMonth:      '',   // YYYY-MM
    scheduleMonthStart: '',   // YYYY-MM-01
    scheduleMonthLabel: '',   // display: YYYY年MM月
    monthDays:          [],
    monthLoading:       false,
    // Year view
    scheduleYear:       0,
    yearMonths:         [],
    yearLoading:        false,

    // 预约详情底部弹窗
    showBookingDetail:  false,
    detailBooking:      null,

    // 标记完成弹窗
    showCompleteModal:  false,
    completingBooking:  null,
    completePriceInput: '',
    completeFinalPrice: 0,
    completeRemainder:  0,

    // ── Customers ────────────────────────────────────────────────────────────
    customers:       [],
    customerLoading: false,
    customerSearch:  '',

    // ── Tech workbench ────────────────────────────────────────────────────────
    todayBookings:     [],
    techRevenue:       0,
    techGanttBookings: [],

    // ── Tech calendar (Lark-style) ────────────────────────────────────────────
    techCalDate:        '',
    techCalMonth:       '',
    techCalMonthStart:  '',
    techCalMonthLabel:  '',
    techCalDateLabel:   '',
    techMonthDays:      [],
    techDayGantt:       [],
    techDayLoading:     false,
  },

  _canvasReady:    false,
  _mode:           null,
  _ganttTechsBase: null,

  onLoad(options) {
    this._mode = options.mode || null;

    // Build 30-min time-slot labels: 11:00 … 21:30
    const timeSlots = [];
    const gridLines = [];
    for (let h = DAY_START_H; h < DAY_END_H; h++) {
      timeSlots.push(`${String(h).padStart(2,'0')}:00`);
      timeSlots.push(`${String(h).padStart(2,'0')}:30`);
    }
    for (let i = 0; i <= timeSlots.length; i++) {
      gridLines.push({
        top: i * SLOT_H,
        isHour: i < timeSlots.length ? timeSlots[i].endsWith(':00') : true,
      });
    }

    const today              = _today();
    const now                = new Date();
    const scheduleWeekStart  = this._weekStart(today);
    const scheduleWeek       = this._buildWeek(scheduleWeekStart);
    const scheduleYear       = now.getFullYear();
    const scheduleMonth      = `${scheduleYear}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const scheduleMonthStart = scheduleMonth + '-01';
    const techCalMonth       = scheduleMonth;
    this.setData({
      timeSlots, gridLines,
      scheduleDate: today, scheduleWeekStart, scheduleWeek, scheduleYear,
      scheduleMonth, scheduleMonthStart, scheduleMonthLabel: _fmtMonthLabel(scheduleMonth),
      techCalDate: today, techCalMonth, techCalMonthStart: techCalMonth + '-01',
      techCalMonthLabel: _fmtMonthLabel(techCalMonth), techCalDateLabel: _fmtDateLabel(today),
    });
  },

  onShow() { this.loadStats(); },

  onReady() {
    this._canvasReady = true;
    this._tryDrawCharts();
  },

  // ── Admin tab switching ───────────────────────────────────────────────────
  switchAdminTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.adminTab) return;
    this.setData({ adminTab: tab });
    if (tab === 'schedule') {
      this.loadMonthView();
      this.loadGantt();
    }
    if (tab === 'customers' && !this.data.customers.length) this.loadCustomers();
    // Canvases inside wx:if get destroyed on tab switch; redraw after DOM re-creates them
    if (tab === 'overview') wx.nextTick(() => wx.nextTick(() => this._tryDrawCharts()));
  },

  // ── Overview ─────────────────────────────────────────────────────────────
  async loadStats() {
    // Only show full-page loading on first entry (role not yet known)
    const firstLoad = !this.data.role;
    if (firstLoad) this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'adminGetStats',
        data: this._mode ? { mode: this._mode } : {},
      });
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '加载失败', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }
      const r = res.result;
      if (r.role === 'admin') {
        const techStats = (r.techStats || []).map((t, i) => ({
          ...t, color: CHART_COLORS[i % CHART_COLORS.length],
        }));
        this.setData({
          role: 'admin', todayCount: r.todayCount, todayCompleted: r.todayCompleted,
          todayRevenue: r.todayRevenue, pendingCount: r.pendingCount,
          userCount: r.userCount, newUserCount: r.newUserCount,
          techStats, dailyStats: r.dailyStats || [],
        });
        wx.nextTick(() => wx.nextTick(() => this._tryDrawCharts()));
      } else {
        const bookings = (r.todayBookings || [])
          .map(b => ({ ...b, statusLabel: STATUS_LABEL[b.status] || b.status }))
          .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        const techGanttBookings = bookings.map(b => {
          const parts    = (b.time || '11:00').split(':');
          const startMin = parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
          const durMatch = (b.duration || '60分钟').match(/(\d+)/);
          const durMin   = durMatch ? parseInt(durMatch[1]) : 60;
          const ganttTop    = Math.max(0, (startMin - DAY_START_H * 60) / 30 * SLOT_H);
          const ganttHeight = Math.max(SLOT_H, Math.round(durMin / 30 * SLOT_H));
          return { ...b, ganttTop, ganttHeight };
        });
        const today = _today();
        const firstInit = !this.data.techCalDate;
        const updates = {
          role: 'technician', linkedTechId: r.linkedTechId || '',
          todayBookings: bookings, techRevenue: r.todayRevenue || 0, techGanttBookings,
        };
        if (firstInit) {
          updates.techCalDate       = today;
          updates.techCalDateLabel  = _fmtDateLabel(today);
          updates.techDayGantt      = techGanttBookings;
        } else if (this.data.techCalDate === today) {
          updates.techDayGantt = techGanttBookings;
        }
        this.setData(updates);
        this.loadTechMonthView();
      }
    } catch (e) {
      wx.showToast({ title: '网络错误', icon: 'none' });
      console.error('loadStats:', e);
    } finally {
      if (firstLoad) this.setData({ loading: false });
    }
  },

  _tryDrawCharts() {
    if (!this._canvasReady || this.data.role !== 'admin') return;
    const { techStats, dailyStats } = this.data;
    this._renderPie('pie-bookings', techStats.map(t => ({ value: t.bookingCount, color: t.color, name: t.name })));
    this._renderPie('pie-revenue',  techStats.map(t => ({ value: t.revenue,      color: t.color, name: t.name })));
    this._renderLine('line-bookings', dailyStats.map(d => ({ value: d.bookingCount, label: d.date })), '#C8847A');
    this._renderLine('line-revenue',  dailyStats.map(d => ({ value: d.revenue,      label: d.date })), '#C9A76B');
    this._renderLine('line-avg',      dailyStats.map(d => ({
      value: d.bookingCount > 0 ? Math.round(d.revenue / d.bookingCount) : 0, label: d.date,
    })), '#5BBCAA');
  },

  _renderPie(id, segments) {
    const query = wx.createSelectorQuery().in(this);
    query.select(`#${id}`).fields({ node: true, size: true }).exec(([res]) => {
      if (!res || !res.node) return;
      const canvas = res.node;
      const dpr = wx.getWindowInfo().pixelRatio;
      canvas.width = res.width * dpr; canvas.height = res.height * dpr;
      const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
      drawPie(ctx, res.width, res.height, segments);
    });
  },

  _renderLine(id, points, color) {
    const query = wx.createSelectorQuery().in(this);
    query.select(`#${id}`).fields({ node: true, size: true }).exec(([res]) => {
      if (!res || !res.node) return;
      const canvas = res.node;
      const dpr = wx.getWindowInfo().pixelRatio;
      canvas.width = res.width * dpr; canvas.height = res.height * dpr;
      const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
      drawLine(ctx, res.width, res.height, points, color);
    });
  },

  // ── Schedule / Timeline ───────────────────────────────────────────────────
  _weekStart(dateStr) {
    const dt  = new Date(dateStr + 'T00:00:00');
    const dow = dt.getDay();
    const mon = new Date(dt);
    mon.setDate(dt.getDate() + (dow === 0 ? -6 : 1 - dow));
    return _fmt(mon);
  },

  _buildWeek(weekStartStr) {
    const labels = ['一', '二', '三', '四', '五', '六', '日'];
    const todayS = _today();
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(weekStartStr + 'T00:00:00');
      dt.setDate(dt.getDate() + i);
      const dateStr = _fmt(dt);
      return { dateStr, day: dt.getDate(), label: labels[i], isToday: dateStr === todayS };
    });
  },

  prevWeek() {
    const dt = new Date(this.data.scheduleWeekStart + 'T00:00:00');
    dt.setDate(dt.getDate() - 7);
    const s = _fmt(dt);
    this.setData({ scheduleWeekStart: s, scheduleWeek: this._buildWeek(s) });
  },

  nextWeek() {
    const dt = new Date(this.data.scheduleWeekStart + 'T00:00:00');
    dt.setDate(dt.getDate() + 7);
    const s = _fmt(dt);
    this.setData({ scheduleWeekStart: s, scheduleWeek: this._buildWeek(s) });
  },

  onWeekDayTap(e) {
    const date = e.currentTarget.dataset.date;
    if (date === this.data.scheduleDate) return;
    this.setData({ scheduleDate: date }, () => this.loadGantt());
  },

  async loadGantt() {
    this.setData({ ganttLoading: true });
    try {
      if (!this._ganttTechsBase) {
        const db = wx.cloud.database();
        const r  = await db.collection('technicians').orderBy('order', 'asc').get();
        this._ganttTechsBase = r.data;
      }
      const res = await wx.cloud.callFunction({
        name: 'adminGetBookings',
        data: { dateFilter: this.data.scheduleDate, statusFilter: 'all' },
      });
      if (!res.result.success) {
        wx.showToast({ title: '加载失败', icon: 'none' }); return;
      }
      const ganttTechs = this._buildGanttData(this._ganttTechsBase, res.result.bookings);
      this.setData({ ganttTechs });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      console.error('loadGantt:', e);
    } finally {
      this.setData({ ganttLoading: false });
    }
  },

  // Build per-tech columns: [{_id, name, color, bookings:[{ganttTop,ganttHeight,...}]}]
  _buildGanttData(technicians, bookings) {
    const byTech = {};
    (bookings || []).forEach(b => {
      if (!byTech[b.techId]) byTech[b.techId] = [];
      byTech[b.techId].push(b);
    });
    return technicians.map((tech, i) => {
      const color = TECH_COLORS[i % TECH_COLORS.length];
      const techBookings = (byTech[tech._id] || []).map(b => {
        const parts    = (b.time || '11:00').split(':');
        const startMin = parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
        const durMatch = (b.duration || '60分钟').match(/(\d+)/);
        const durMin   = durMatch ? parseInt(durMatch[1]) : 60;
        const ganttTop    = Math.max(0, (startMin - DAY_START_H * 60) / 30 * SLOT_H);
        const ganttHeight = Math.max(SLOT_H, Math.round(durMin / 30 * SLOT_H));
        return { ...b, statusLabel: STATUS_LABEL[b.status] || b.status, ganttTop, ganttHeight };
      });
      return { ...tech, bookings: techBookings, color };
    });
  },

  prevMonth() {
    const [y, m] = this.data.scheduleMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const date = month + '-01';
    this.setData({
      scheduleMonth: month,
      scheduleMonthStart: date,
      scheduleMonthLabel: _fmtMonthLabel(month),
      scheduleDate: date,
    }, () => {
      this.loadMonthView();
      this.loadGantt();
    });
  },

  nextMonth() {
    const [y, m] = this.data.scheduleMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const date = month + '-01';
    this.setData({
      scheduleMonth: month,
      scheduleMonthStart: date,
      scheduleMonthLabel: _fmtMonthLabel(month),
      scheduleDate: date,
    }, () => {
      this.loadMonthView();
      this.loadGantt();
    });
  },

  prevYear() {
    this.setData({ scheduleYear: this.data.scheduleYear - 1 }, () => this.loadYearView());
  },

  nextYear() {
    this.setData({ scheduleYear: this.data.scheduleYear + 1 }, () => this.loadYearView());
  },

  async loadMonthView() {
    const { scheduleMonthStart } = this.data;
    this.setData({ monthLoading: true });
    try {
      const [y, mo] = scheduleMonthStart.split('-').map(Number);
      const lastDay = new Date(y, mo, 0).getDate();
      const endStr  = `${scheduleMonthStart.slice(0,7)}-${String(lastDay).padStart(2,'0')}`;
      const res = await wx.cloud.callFunction({
        name: 'adminGetBookings',
        data: { dateFrom: scheduleMonthStart, dateTo: endStr, statusFilter: 'all' },
      });
      if (!res.result.success) { wx.showToast({ title: '加载失败', icon: 'none' }); return; }
      const countMap = {};
      (res.result.bookings || []).forEach(b => {
        countMap[b.date] = (countMap[b.date] || 0) + 1;
      });
      const monthDays = this._buildMonthGrid(y, mo, countMap);
      this.setData({ monthDays });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ monthLoading: false });
    }
  },

  _buildMonthGrid(year, month, countMap) {
    const todayS  = _today();
    const firstDt = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0).getDate();
    // dow of first day (0=Sun…6=Sat) → convert to Mon-based (0=Mon…6=Sun)
    const firstDow = (firstDt.getDay() + 6) % 7;
    const cells = [];
    // leading empty cells
    for (let i = 0; i < firstDow; i++) cells.push({ empty: true });
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      cells.push({
        empty:   false,
        day:     d,
        dateStr,
        count:   countMap[dateStr] || 0,
        isToday: dateStr === todayS,
      });
    }
    return cells;
  },

  async loadYearView() {
    const year = this.data.scheduleYear;
    this.setData({ yearLoading: true });
    try {
      const startStr = `${year}-01-01`;
      const endStr   = `${year}-12-31`;
      const res = await wx.cloud.callFunction({
        name: 'adminGetBookings',
        data: { dateFrom: startStr, dateTo: endStr, statusFilter: 'all' },
      });
      if (!res.result.success) { wx.showToast({ title: '加载失败', icon: 'none' }); return; }
      const countMap = {};
      (res.result.bookings || []).forEach(b => {
        const mo = (b.date || '').slice(0, 7);
        countMap[mo] = (countMap[mo] || 0) + 1;
      });
      const todayMo = _today().slice(0, 7);
      const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
      const yearMonths = Array.from({ length: 12 }, (_, i) => {
        const mo = `${year}-${String(i+1).padStart(2,'0')}`;
        return { mo, label: monthNames[i], count: countMap[mo] || 0, isCurrent: mo === todayMo };
      });
      this.setData({ yearMonths });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ yearLoading: false });
    }
  },

  onMonthDayTap(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    this.setData({ scheduleDate: date }, () => this.loadGantt());
  },

  onYearMonthTap(e) {
    const mo = e.currentTarget.dataset.mo;
    if (!mo) return;
    this.setData({ scheduleMonth: mo, scheduleMonthStart: mo + '-01', scheduleMonthLabel: _fmtMonthLabel(mo) },
      () => this.loadMonthView());
  },

  // ── Tech calendar (Lark-style) ────────────────────────────────────────────
  prevTechMonth() {
    const [y, m] = this.data.techCalMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    const mo = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    this.setData({ techCalMonth: mo, techCalMonthStart: mo + '-01', techCalMonthLabel: _fmtMonthLabel(mo) },
      () => this.loadTechMonthView());
  },

  nextTechMonth() {
    const [y, m] = this.data.techCalMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    const mo = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    this.setData({ techCalMonth: mo, techCalMonthStart: mo + '-01', techCalMonthLabel: _fmtMonthLabel(mo) },
      () => this.loadTechMonthView());
  },

  async loadTechMonthView() {
    const { techCalMonthStart } = this.data;
    if (!techCalMonthStart) return;
    try {
      const [y, mo] = techCalMonthStart.split('-').map(Number);
      const lastDay = new Date(y, mo, 0).getDate();
      const endStr  = `${techCalMonthStart.slice(0,7)}-${String(lastDay).padStart(2,'0')}`;
      const res = await wx.cloud.callFunction({
        name: 'adminGetBookings',
        data: { dateFrom: techCalMonthStart, dateTo: endStr, statusFilter: 'all' },
      });
      if (!res.result.success) return;
      const linkedTechId = this.data.linkedTechId;
      const countMap = {};
      (res.result.bookings || [])
        .filter(b => !linkedTechId || b.techId === linkedTechId)
        .forEach(b => { countMap[b.date] = (countMap[b.date] || 0) + 1; });
      const techMonthDays = this._buildMonthGrid(y, mo, countMap);
      this.setData({ techMonthDays });
    } catch (e) {
      console.error('loadTechMonthView:', e);
    }
  },

  async loadTechDayView(date) {
    this.setData({ techDayLoading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'adminGetBookings',
        data: { dateFilter: date, statusFilter: 'all' },
      });
      if (!res.result.success) { this.setData({ techDayLoading: false }); return; }
      const linkedTechId = this.data.linkedTechId;
      const techDayGantt = (res.result.bookings || [])
        .filter(b => !linkedTechId || b.techId === linkedTechId)
        .map(b => {
        const parts    = (b.time || '11:00').split(':');
        const startMin = parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
        const durMatch = (b.duration || '60分钟').match(/(\d+)/);
        const durMin   = durMatch ? parseInt(durMatch[1]) : 60;
        const ganttTop    = Math.max(0, (startMin - DAY_START_H * 60) / 30 * SLOT_H);
        const ganttHeight = Math.max(SLOT_H, Math.round(durMin / 30 * SLOT_H));
        return { ...b, statusLabel: STATUS_LABEL[b.status] || b.status, ganttTop, ganttHeight };
      });
      this.setData({ techDayGantt });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ techDayLoading: false });
    }
  },

  onTechCalDayTap(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    this.setData({ techCalDate: date, techCalDateLabel: _fmtDateLabel(date) });
    this.loadTechDayView(date);
  },

  onGanttCardTap(e) {
    const id = e.currentTarget.dataset.id;
    for (const tech of this.data.ganttTechs) {
      const bk = (tech.bookings || []).find(b => b._id === id);
      if (bk) { this.setData({ showBookingDetail: true, detailBooking: bk }); return; }
    }
    const bk = (this.data.techDayGantt || []).find(b => b._id === id)
            || (this.data.techGanttBookings || []).find(b => b._id === id);
    if (bk) this.setData({ showBookingDetail: true, detailBooking: bk });
  },

  closeBookingDetail() {
    this.setData({ showBookingDetail: false, detailBooking: null });
  },

  // ── Booking actions (from detail modal) ───────────────────────────────────
  async updateStatus(e) {
    const { id, status } = e.currentTarget.dataset;
    if (status === 'completed') {
      const booking = this.data.detailBooking;
      if (booking && booking._id === id) {
        this.setData({ showBookingDetail: false });
        this._openCompleteModal(booking);
      }
      return;
    }
    wx.showModal({
      title: STATUS_LABEL[status] || '更新状态',
      content: `确认将此预约状态改为「${STATUS_LABEL[status]}」吗？`,
      confirmColor: status === 'cancelled' ? '#C0392B' : '#C8847A',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '更新中...' });
        try {
          const result = await wx.cloud.callFunction({
            name: 'adminUpdateBooking',
            data: { bookingId: id, status },
          });
          wx.hideLoading();
          if (result.result.success) {
            this.setData({ showBookingDetail: false, detailBooking: null });
            wx.showToast({ title: '已更新', icon: 'success' });
            this.data.role === 'technician' ? this.loadStats() : this.loadGantt();
          } else {
            wx.showToast({ title: result.result.error || '更新失败', icon: 'none' });
          }
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      },
    });
  },

  markDepositPaid(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '标记已收定金',
      content: '确认已收到客户定金？',
      confirmColor: '#C8847A',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '更新中...' });
        try {
          const result = await wx.cloud.callFunction({
            name: 'adminUpdateBooking',
            data: { bookingId: id, depositStatus: 'paid' },
          });
          wx.hideLoading();
          if (result.result.success) {
            this.setData({ showBookingDetail: false, detailBooking: null });
            wx.showToast({ title: '已标记', icon: 'success' });
            this.data.role === 'technician' ? this.loadStats() : this.loadGantt();
          } else {
            wx.showToast({ title: result.result.error || '更新失败', icon: 'none' });
          }
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      },
    });
  },

  _calcCompleteFields(actualPrice, booking) {
    const discountRate       = booking.discountRate || 1.0;
    const completeFinalPrice = discountRate < 1 ? Math.round(actualPrice * discountRate) : actualPrice;
    const depositPaid        = booking.depositStatus === 'paid' ? (booking.depositAmount || 0) : 0;
    const completeRemainder  = Math.max(0, completeFinalPrice - depositPaid);
    return { completeFinalPrice, completeRemainder };
  },

  _openCompleteModal(booking) {
    const actualPrice = booking.price || 0;
    const { completeFinalPrice, completeRemainder } = this._calcCompleteFields(actualPrice, booking);
    this.setData({
      showCompleteModal:  true,
      completingBooking:  booking,
      completePriceInput: String(booking.price || ''),
      completeFinalPrice,
      completeRemainder,
    });
  },

  onCompletePriceInput(e) {
    const val         = e.detail.value;
    const actualPrice = parseFloat(val) || 0;
    const { completeFinalPrice, completeRemainder } =
      this._calcCompleteFields(actualPrice, this.data.completingBooking);
    this.setData({ completePriceInput: val, completeFinalPrice, completeRemainder });
  },

  cancelCompleteModal() {
    this.setData({ showCompleteModal: false, completingBooking: null });
  },

  async confirmComplete() {
    const { completingBooking, completePriceInput, completeFinalPrice } = this.data;
    const actualPrice = parseFloat(completePriceInput);
    if (isNaN(actualPrice) || actualPrice < 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' }); return;
    }
    wx.showLoading({ title: '更新中...' });
    try {
      const result = await wx.cloud.callFunction({
        name: 'adminUpdateBooking',
        data: { bookingId: completingBooking._id, status: 'completed', finalPrice: completeFinalPrice },
      });
      wx.hideLoading();
      if (result.result.success) {
        this.setData({ showCompleteModal: false, completingBooking: null });
        wx.showToast({ title: '已完成', icon: 'success' });
        this.data.role === 'technician' ? this.loadStats() : this.loadGantt();
      } else {
        wx.showToast({ title: result.result.error || '更新失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  // ── Customers ─────────────────────────────────────────────────────────────
  async loadCustomers() {
    this.setData({ customerLoading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'adminGetCustomers',
        data: { search: this.data.customerSearch },
      });
      if (res.result.success) {
        const customers = res.result.customers.map(c => ({
          ...c,
          tierLabel: TIER_LABEL[c.tier] || c.tier,
          tierColor: TIER_COLOR[c.tier] || '#888888',
        }));
        this.setData({ customers });
      } else {
        wx.showToast({ title: res.result.error || '加载失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ customerLoading: false });
    }
  },

  onCustomerSearchInput(e) { this.setData({ customerSearch: e.detail.value }); },
  onCustomerSearch()       { this.loadCustomers(); },
  goCustomerDetail()       { wx.showToast({ title: '客户详情开发中', icon: 'none' }); },
  goAddCustomer()          { wx.showToast({ title: '新增会员开发中', icon: 'none' }); },

  // ── Navigation ────────────────────────────────────────────────────────────
  goDayPerf() {
    wx.navigateTo({ url: '/pages/admin/day-perf/index' });
  },

  goTechDayPerf() {
    const techId = this.data.linkedTechId;
    if (!techId) { wx.showToast({ title: '未关联技师档案', icon: 'none' }); return; }
    wx.navigateTo({ url: `/pages/admin/day-perf/index?techId=${techId}` });
  },

  goChartDetail(e) {
    const type = e.currentTarget.dataset.type || 'bookings';
    wx.navigateTo({ url: `/pages/admin/chart-detail/index?type=${type}` });
  },

  goTechList()  { wx.navigateTo({ url: '/pages/admin/tech-list/index' }); },
  goPkgList()   { wx.navigateTo({ url: '/pages/admin/pkg-list/index' }); },
  goRoles()     { wx.navigateTo({ url: '/pages/admin/roles/index' }); },
  goBack()      { wx.navigateBack(); },

  goTechProfile() {
    const techId = this.data.linkedTechId;
    if (techId) {
      wx.navigateTo({ url: `/pages/admin/tech-edit/index?id=${techId}` });
    } else {
      wx.showToast({ title: '未关联技师档案', icon: 'none' });
    }
  },

  goBookings() {
    wx.navigateTo({ url: '/pages/admin/bookings/index' });
  },
});
