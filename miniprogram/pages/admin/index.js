const app = getApp();
const { drawPie, drawLine, CHART_COLORS } = require('../../utils/chartHelper');

const { statusBarHeight, windowWidth } = wx.getWindowInfo();
const NAV_TOP = statusBarHeight + 12;

// Time column width in rpx; scroll-view gets the rest in px
const TIME_COL_RPX  = 104;
const TIME_COL_PX   = Math.round(TIME_COL_RPX * windowWidth / 750);
const GANTT_SCROLL_W = windowWidth - TIME_COL_PX;

// ─── Schedule constants ───────────────────────────────────────────────────────
const DAY_START_H = 10;   // 10:00
const DAY_END_H   = 23;   // 23:00 exclusive (last slot = 22:30)
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

const CRM_FILTER_HINTS = {
  all:         '全部客户',
  birthday:    '本月生日的客户',
  followup:    '订单完成后 3-10 天内待回访（含首单）',
  lash_refill: '嫁接/种植睫毛距今 21-35 天',
  nail_refill: '美甲/凝胶服务距今 28-45 天',
  pedi_refill: '美脚/足部服务距今 28-45 天',
  lapsing:     '45-90 天未到店',
  dormant:     '超过 90 天未到店，或从未到店',
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

const _DOW = ['周日','周一','周二','周三','周四','周五','周六'];
function _staffDateLabel(dateStr) {
  const dt = new Date(dateStr + 'T00:00:00');
  return `${dt.getMonth()+1}月${dt.getDate()}日 · ${_DOW[dt.getDay()]}`;
}

// Staff schedule bar positioning (10:00–22:00 = 720 min range)
const _SCHED_START = 10 * 60;
const _SCHED_RANGE = 12 * 60;
function _timeToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function _calcHours(s, e) {
  const d = _timeToMin(e) - _timeToMin(s);
  if (d <= 0) return '0';
  const h = d / 60;
  return h === Math.floor(h) ? String(h) : h.toFixed(1);
}
function _barPos(workStart, workEnd) {
  const left  = Math.max(0, (_timeToMin(workStart) - _SCHED_START) / _SCHED_RANGE * 100);
  const width = Math.min(100 - left, (_timeToMin(workEnd) - _timeToMin(workStart)) / _SCHED_RANGE * 100);
  return { barLeft: left.toFixed(1) + '%', barWidth: Math.max(0, width).toFixed(1) + '%' };
}

function _weekEnd(weekStartStr) {
  const dt = new Date(weekStartStr + 'T00:00:00');
  dt.setDate(dt.getDate() + 6);
  return _fmt(dt);
}
function _staffWeekLabel(startStr, endStr) {
  const s = new Date(startStr + 'T00:00:00');
  const e = new Date(endStr   + 'T00:00:00');
  const sm = s.getMonth() + 1, em = e.getMonth() + 1;
  return sm === em
    ? `${sm}月${s.getDate()}—${e.getDate()}日`
    : `${sm}月${s.getDate()}日—${em}月${e.getDate()}日`;
}
function _shortTime(t) {
  // "10:00" → "10", "10:30" → "10:30"
  return t && t.endsWith(':00') ? t.slice(0, 2) : (t || '');
}

const QUOTE_ADDONS = ['加固/建构', '跳色/渐变/猫眼', '磨砂/钢化封层', '饰品收费', '手绘收费', '下睫毛', '足部去死皮', '手部护理升级', '加急服务', '甲片升级/修补'];

// Time-axis markers for the staff day view (every 2 hours)
const STAFF_TIME_MARKERS = [10, 12, 14, 16, 18, 20, 22].map((h, i, arr) => ({
  label: String(h),
  left: (((h - 10) * 60) / _SCHED_RANGE * 100).toFixed(1) + '%',
  isFirst: i === 0,
  isLast:  i === arr.length - 1,
}));

Page({
  data: {
    navTopPadding: NAV_TOP,
    loading: true,
    role: '',
    linkedTechId: '',

    // ── Admin bottom tab ─────────────────────────────────────────────────────
    adminTab: 'overview',

    // ── Quotes tab ──────────────────────────────────────────────────────────
    quotePendingCount: 0,
    quotes: [],
    filteredQuotes: [],
    quoteFilter: 'active',
    quotesLoading: false,
    showQuotesSection: true,
    showQuoteSheet: false,
    activeQuote: null,
    quoteForm: { categoryId: '', mainService: '', serviceId: '', serviceName: '', addons: [], addonsMap: {}, durationMin: '', price: '', techId: '', techName: '', adminNote: '' },
    quoteCategories: [],
    quoteAllServices: [],
    quoteServices: [],
    quoteAddons: QUOTE_ADDONS,
    technicians: [],

    // ── Overview ─────────────────────────────────────────────────────────────
    todayDateStr:   _todayDisplay(),
    todayCount:        0,
    todayPendingCount: 0,
    todayConfirmed:    0,
    todayCompleted:    0,
    todayCancelled:    0,
    todayRevenue:      0,
    pendingCount:      0,
    userCount:         0,
    newUserCount:      0,
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

    // 关联会员弹窗
    showLinkMemberModal: false,
    linkingBookingId:    null,
    linkQuery:           '',
    linkSearchResult:    null,
    linkSearchLoading:   false,

    // 标记完成弹窗
    showCompleteModal:  false,
    completingBooking:  null,
    completePriceInput: '',
    completeFinalPrice: 0,
    completeRemainder:  0,
    // 确认收款弹窗
    showPayModal:       false,
    payingBooking:      null,
    selectedPayMethod:  'cash',

    // ── Staff schedule views ──────────────────────────────────────────────────
    staffView:        'day',   // 'day' | 'week' | 'month'
    // Day view
    staffDate:        '',
    staffIsToday:     true,
    staffDateLabel:   '',
    staffTimeMarkers: STAFF_TIME_MARKERS,
    staffLoading:     false,
    staffRows:        [],
    // Week view
    staffWeekStart:   '',
    staffWeekLabel:   '',
    staffWeekCols:    [],
    staffWeekRows:    [],
    staffWeekLoading: false,
    // Month view
    staffMonthStr:    '',
    staffMonthLabel:  '',
    staffMonthDays:   [],
    staffMonthLoading: false,

    // ── Customers ────────────────────────────────────────────────────────────
    customers:       [],
    customerLoading: false,
    customerSearch:  '',

    // ── CRM ──────────────────────────────────────────────────────────────────
    crmCustomers:         [],
    filteredCrmCustomers: [],
    crmLoading:           false,
    crmFilter:            'all',
    crmFilterHint:        CRM_FILTER_HINTS.all,
    showCrmDetail:        false,
    crmCustomer:          null,
    crmDetailTab:         'profile',
    crmNotesDraft:        '',
    crmTagsMap:           {},
    crmStyleMap:          {},
    crmCustomTagInput:    '',
    crmTagOptions:  ['高消费', 'VIP', '敏感肌', '宠物主人', '睫毛客', '美甲客', '需关注', '流失风险'],
    crmStyleOptions:['简约', '法式', '猫眼', '日系', '个性', '渐变', '花卉', '卡通'],
    crmLogs:              [],
    crmLogMood:           'normal',
    crmLogContent:        '',
    crmBookingHistory:    [],
    crmHistoryAll:        [],
    crmHistoryPage:       1,
    crmHistoryTotalPages: 1,

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
      staffDate: today, staffIsToday: true, staffDateLabel: _staffDateLabel(today),
      staffWeekStart: this._weekStart(today),
      staffWeekLabel: _staffWeekLabel(this._weekStart(today), _weekEnd(this._weekStart(today))),
      staffMonthStr: scheduleMonth, staffMonthLabel: _fmtMonthLabel(scheduleMonth),
    });
  },

  onShow() {
    this.loadStats().then(() => {
      const { role, adminTab, techCalDate } = this.data;
      if (role === 'technician') {
        this.loadTechDayView(techCalDate || _today());
      } else if (role === 'admin' && adminTab === 'schedule') {
        this.loadGantt();
      }
      if (role === 'admin') this._refreshQuotePendingCount();
    });
  },

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
      this.loadQuotes();
    }
    if (tab === 'staff') this._loadCurrentStaffView();
    if (tab === 'customers') this.loadCrm();
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
        data: { clientDate: _today(), ...(this._mode ? { mode: this._mode } : {}) },
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
          role: 'admin',
          todayCount:        r.todayCount,
          todayPendingCount: r.todayPendingCount || 0,
          todayConfirmed:    r.todayConfirmed    || 0,
          todayCompleted:    r.todayCompleted,
          todayCancelled:    r.todayCancelled    || 0,
          todayRevenue:      r.todayRevenue,
          pendingCount:      r.pendingCount,
          userCount:         r.userCount,
          newUserCount:      r.newUserCount,
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
          const durMin   = b.durationMin || 60;
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
          updates.techCalDate      = today;
          updates.techCalDateLabel = _fmtDateLabel(today);
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
        const durMin   = b.durationMin || 60;
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
      const pendingMap = {};
      (res.result.bookings || []).forEach(b => {
        countMap[b.date] = (countMap[b.date] || 0) + 1;
        if (b.status === 'pending') pendingMap[b.date] = (pendingMap[b.date] || 0) + 1;
      });
      const monthDays = this._buildMonthGrid(y, mo, countMap, undefined, pendingMap);
      this.setData({ monthDays });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ monthLoading: false });
    }
  },

  _buildMonthGrid(year, month, countMap, offDays, pendingMap) {
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
        empty:        false,
        day:          d,
        dateStr,
        count:        countMap[dateStr]  || 0,
        pendingCount: pendingMap ? (pendingMap[dateStr] || 0) : 0,
        isToday:      dateStr === todayS,
        isOff:        offDays ? offDays.has(dateStr) : false,
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
      const linkedTechId = this.data.linkedTechId;

      // Fetch bookings and schedule in parallel
      const [bookingsRes, scheduleRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'adminGetBookings',
          data: { dateFrom: techCalMonthStart, dateTo: endStr, statusFilter: 'all' },
        }),
        linkedTechId
          ? wx.cloud.callFunction({
              name: 'getSchedule',
              data: { techId: linkedTechId, dateFrom: techCalMonthStart, dateTo: endStr },
            }).catch(() => ({ result: { success: false, schedules: [] } }))
          : Promise.resolve({ result: { success: true, schedules: [] } }),
      ]);

      if (!bookingsRes.result.success) return;

      const countMap = {};
      const pendingMap = {};
      (bookingsRes.result.bookings || [])
        .filter(b => !linkedTechId || b.techId === linkedTechId)
        .forEach(b => {
          countMap[b.date] = (countMap[b.date] || 0) + 1;
          if (b.status === 'pending') pendingMap[b.date] = (pendingMap[b.date] || 0) + 1;
        });

      const offDays = new Set();
      for (const s of (scheduleRes.result.schedules || [])) {
        if (s.isWorking === false) offDays.add(s.date);
      }

      const techMonthDays = this._buildMonthGrid(y, mo, countMap, offDays, pendingMap);
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
        const durMin   = b.durationMin || 60;
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
            this._refreshAfterUpdate();
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
            this._refreshAfterUpdate();
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
        wx.showToast({ title: '已标记完成', icon: 'success' });
        this._refreshAfterUpdate();
      } else {
        wx.showToast({ title: result.result.error || '更新失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  // 状态变更后刷新视图
  _refreshAfterUpdate() {
    if (this.data.role === 'technician') {
      // 直接刷新当前日历日期的甘特，不依赖 loadStats 的日期判断
      this.loadTechDayView(this.data.techCalDate);
      this.loadStats(); // 同步更新营收数字
    } else {
      this.loadGantt();
    }
  },

  // ── 确认收款 ───────────────────────────────────────────────────────────────

  openPayModal(e) {
    const id = e.currentTarget.dataset.id;
    const bk = this.data.detailBooking;
    if (!bk || bk._id !== id) return;
    this.setData({ showPayModal: true, payingBooking: bk, selectedPayMethod: 'cash' });
  },

  closePayModal() {
    this.setData({ showPayModal: false, payingBooking: null });
  },

  onSelectPayMethod(e) {
    this.setData({ selectedPayMethod: e.currentTarget.dataset.method });
  },

  async confirmPayment() {
    const { payingBooking, selectedPayMethod } = this.data;
    if (!selectedPayMethod) {
      wx.showToast({ title: '请选择收款方式', icon: 'none' }); return;
    }
    wx.showLoading({ title: '更新中...' });
    try {
      const result = await wx.cloud.callFunction({
        name: 'adminUpdateBooking',
        data: { bookingId: payingBooking._id, paymentMethod: selectedPayMethod },
      });
      wx.hideLoading();
      if (result.result.success) {
        this.setData({ showPayModal: false, payingBooking: null, showBookingDetail: false, detailBooking: null });
        wx.showToast({ title: '已确认收款', icon: 'success' });
        this._refreshAfterUpdate();
      } else {
        wx.showToast({ title: result.result.error || '操作失败', icon: 'none' });
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

  onCustomerSearchInput(e) {
    const search = e.detail.value;
    this.setData({ customerSearch: search });
    this._applyCrmFilter(this.data.crmCustomers, this.data.crmFilter, search);
  },

  // ── CRM ──────────────────────────────────────────────────────────────────
  async loadCrm() {
    this.setData({ crmLoading: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'getCrmDashboard', data: { clientDate: _today() } });
      if (res.result.success) {
        const customers = res.result.customers;
        this.setData({ crmCustomers: customers });
        this._applyCrmFilter(customers, this.data.crmFilter);
      } else {
        wx.showToast({ title: res.result.error || '加载失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ crmLoading: false });
    }
  },

  setCrmFilter(e) {
    const f = e.currentTarget.dataset.f;
    this.setData({ crmFilter: f, crmFilterHint: CRM_FILTER_HINTS[f] || '' });
    this._applyCrmFilter(this.data.crmCustomers, f, this.data.customerSearch);
  },

  _applyCrmFilter(customers, filter, search = '') {
    let list = customers;
    if (filter !== 'all') {
      list = list.filter(c => (c.alerts || []).some(a =>
        a.type === filter ||
        (filter === 'followup' && a.type === 'first_order_followup') ||
        (filter === 'nail_refill' && a.type === 'nail_refill') ||
        (filter === 'pedi_refill' && a.type === 'pedi_refill')
      ));
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(c =>
        c.nickname.toLowerCase().includes(s) || (c.phone || '').includes(s)
      );
    }
    this.setData({ filteredCrmCustomers: list });
  },

  openCrmDetail(e) {
    const idx = e.currentTarget.dataset.idx;
    const c = this.data.filteredCrmCustomers[idx];
    // tags map
    const crmTagsMap = {};
    (c.tags || []).forEach(t => { crmTagsMap[t] = true; });
    const baseTagOpts = ['高消费', 'VIP', '敏感肌', '宠物主人', '睫毛客', '美甲客', '需关注', '流失风险'];
    const crmTagOptions = [...baseTagOpts, ...(c.tags || []).filter(t => !baseTagOpts.includes(t))];
    // style map
    const crmStyleMap = {};
    (c.stylePrefs || []).forEach(s => { crmStyleMap[s] = true; });
    this.setData({
      showCrmDetail: true, crmDetailTab: 'profile',
      crmCustomer: c, crmNotesDraft: c.crmNotes || '',
      crmTagsMap, crmTagOptions, crmStyleMap,
      crmCustomTagInput: '',
      crmLogs: [], crmBookingHistory: [], crmHistoryAll: [], crmHistoryPage: 1, crmHistoryTotalPages: 1,
      crmLogMood: 'normal', crmLogContent: '',
    });
    this._loadCrmLogs(c._id);
    this._loadCrmBookingHistory(c._id);
  },

  closeCrmDetail() { this.setData({ showCrmDetail: false }); },

  setCrmDetailTab(e) {
    this.setData({ crmDetailTab: e.currentTarget.dataset.tab });
  },

  // ── 档案字段 ──
  onCrmNotesInput(e)     { this.setData({ crmNotesDraft: e.detail.value }); },
  onCrmCustomTagInput(e) { this.setData({ crmCustomTagInput: e.detail.value }); },

  setPriceSensitivity(e) { this.setData({ 'crmCustomer.priceSensitivity': e.currentTarget.dataset.v }); },
  setTimePreference(e)   { this.setData({ 'crmCustomer.timePreference':   e.currentTarget.dataset.v }); },
  toggleHasPet()         { this.setData({ 'crmCustomer.hasPet':       !this.data.crmCustomer.hasPet }); },
  toggleLikesPosting()   { this.setData({ 'crmCustomer.likesPosting': !this.data.crmCustomer.likesPosting }); },

  toggleStylePref(e) {
    const tag = e.currentTarget.dataset.tag;
    const crmStyleMap = { ...this.data.crmStyleMap, [tag]: !this.data.crmStyleMap[tag] };
    const stylePrefs = Object.keys(crmStyleMap).filter(k => crmStyleMap[k]);
    this.setData({ crmStyleMap, 'crmCustomer.stylePrefs': stylePrefs });
  },

  toggleCrmTag(e) {
    const tag = e.currentTarget.dataset.tag;
    const crmTagsMap = { ...this.data.crmTagsMap, [tag]: !this.data.crmTagsMap[tag] };
    const tags = Object.keys(crmTagsMap).filter(k => crmTagsMap[k]);
    this.setData({ crmTagsMap, 'crmCustomer.tags': tags });
  },

  addCustomTag() {
    const tag = (this.data.crmCustomTagInput || '').trim();
    if (!tag) return;
    const options = [...this.data.crmTagOptions];
    if (!options.includes(tag)) options.push(tag);
    const crmTagsMap = { ...this.data.crmTagsMap, [tag]: true };
    const tags = Object.keys(crmTagsMap).filter(k => crmTagsMap[k]);
    this.setData({ crmTagOptions: options, crmTagsMap, 'crmCustomer.tags': tags, crmCustomTagInput: '' });
  },

  async saveCrmDetail() {
    const { crmCustomer, crmNotesDraft } = this.data;
    try {
      await wx.cloud.callFunction({
        name: 'updateCrmTag',
        data: {
          targetUserId:    crmCustomer._id,
          tags:            crmCustomer.tags,
          crmNotes:        crmNotesDraft,
          stylePrefs:      crmCustomer.stylePrefs,
          priceSensitivity:crmCustomer.priceSensitivity,
          likesPosting:    crmCustomer.likesPosting,
          hasPet:          crmCustomer.hasPet,
          timePreference:  crmCustomer.timePreference,
        },
      });
      const customers = this.data.crmCustomers.map(c =>
        c._id === crmCustomer._id ? { ...c, ...crmCustomer, crmNotes: crmNotesDraft } : c
      );
      this.setData({ crmCustomers: customers });
      this._applyCrmFilter(customers, this.data.crmFilter, this.data.customerSearch);
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // ── 互动记录 ──
  onCrmLogContentInput(e) { this.setData({ crmLogContent: e.detail.value }); },
  setCrmLogMood(e)        { this.setData({ crmLogMood: e.currentTarget.dataset.m }); },

  async _loadCrmLogs(userId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getCrmLogs',
        data: { userId },
      });
      this.setData({ crmLogs: res.result.success ? res.result.logs : [] });
    } catch (e) {
      this.setData({ crmLogs: [] });
    }
  },

  async submitCrmLog() {
    const { crmCustomer, crmLogMood, crmLogContent, crmLogPrefs } = this.data;
    if (!crmLogContent.trim()) { wx.showToast({ title: '请填写互动内容', icon: 'none' }); return; }
    try {
      const res = await wx.cloud.callFunction({
        name: 'addCrmLog',
        data: { targetUserId: crmCustomer._id, mood: crmLogMood, content: crmLogContent.trim(), clientDate: _today() },
      });
      if (res.result.success) {
        this.setData({
          crmLogs: [res.result.log, ...this.data.crmLogs],
          crmLogContent: '', crmLogMood: 'normal',
        });
        wx.showToast({ title: '已记录', icon: 'success' });
      }
    } catch (e) { wx.showToast({ title: '保存失败', icon: 'none' }); }
  },

  async recalcUserStats() {
    const { crmCustomer } = this.data;
    wx.showLoading({ title: '计算中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'recalcUserStats',
        data: { targetUserId: crmCustomer._id },
      });
      wx.hideLoading();
      if (res.result.success) {
        const { totalSpend, vipLevel } = res.result;
        // 更新本地显示
        const customers = this.data.crmCustomers.map(c =>
          c._id === crmCustomer._id ? { ...c, totalSpend, vipLevel } : c
        );
        this.setData({
          crmCustomers: customers,
          'crmCustomer.totalSpend': totalSpend,
          'crmCustomer.vipLevel':   vipLevel,
        });
        this._applyCrmFilter(customers, this.data.crmFilter, this.data.customerSearch);
        wx.showToast({ title: `已更新：¥${totalSpend} · ${vipLevel}`, icon: 'success' });
      } else {
        wx.showToast({ title: res.result.error || '计算失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  // ── 消费历史 ──
  async _loadCrmBookingHistory(userId) {
    const STATUS_LABEL = { pending:'待确认', confirmed:'已确认', completed:'已完成', paid:'已付款', cancelled:'已取消' };
    try {
      const [bookingsResult, topupsResult] = await Promise.all([
        wx.cloud.callFunction({ name: 'getCrmBookings', data: { userId } })
          .catch(() => ({ result: { success: false } })),
        wx.cloud.callFunction({ name: 'getCrmTopups', data: { userId } })
          .catch(() => ({ result: { success: false } })),
      ]);

      const bookings = (bookingsResult.result.success ? bookingsResult.result.bookings : []).map(b => ({
        _id:         b._id,
        type:        'booking',
        date:        b.date,
        title:       b.serviceName,
        subtitle:    `技师 ${b.techName || ''} · ${b.time || ''}`,
        amount:      b.finalPrice || b.price || 0,
        statusLabel: STATUS_LABEL[b.status] || b.status,
        status:      b.status,
      }));

      const topups = (topupsResult.result.success ? topupsResult.result.logs : []).map(t => ({
        _id:         t._id,
        type:        'topup',
        date:        t.dateStr || '',
        title:       `充值 ¥${t.amount}`,
        subtitle:    '',
        amount:      t.amount || 0,
        statusLabel: '已到账',
        status:      'topup',
      }));

      const all = [...bookings, ...topups].sort((a, b) => (b.date > a.date ? 1 : -1));
      const totalPages = Math.max(1, Math.ceil(all.length / 10));
      this.setData({
        crmHistoryAll:        all,
        crmHistoryPage:       1,
        crmHistoryTotalPages: totalPages,
        crmBookingHistory:    all.slice(0, 10),
      });
    } catch (e) { console.error('_loadCrmBookingHistory:', e); }
  },

  _crmHistorySetPage(page) {
    const all = this.data.crmHistoryAll;
    const totalPages = this.data.crmHistoryTotalPages;
    if (page < 1 || page > totalPages) return;
    this.setData({
      crmHistoryPage:    page,
      crmBookingHistory: all.slice((page - 1) * 10, page * 10),
    });
  },

  crmHistoryPrev() { this._crmHistorySetPage(this.data.crmHistoryPage - 1); },
  crmHistoryNext() { this._crmHistorySetPage(this.data.crmHistoryPage + 1); },

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
  goRevenue()   { wx.navigateTo({ url: '/pages/admin/revenue/index' }); },
  // ── Staff schedule views ──────────────────────────────────────────────────
  switchStaffView(e) {
    const view = e.currentTarget.dataset.view;
    if (view === this.data.staffView) return;
    this.setData({ staffView: view });
    this._loadCurrentStaffView();
  },

  _loadCurrentStaffView() {
    const v = this.data.staffView;
    if (v === 'day')   this.loadStaffView();
    if (v === 'week')  this.loadStaffWeekView();
    if (v === 'month') this.loadStaffMonthView();
  },

  async loadStaffWeekView() {
    const weekStart = this.data.staffWeekStart;
    const weekEnd   = _weekEnd(weekStart);
    this.setData({ staffWeekLoading: true, staffWeekRows: [] });
    try {
      if (!this._ganttTechsBase) {
        const r = await wx.cloud.database().collection('technicians').orderBy('order', 'asc').get();
        this._ganttTechsBase = r.data;
      }
      const techs = this._ganttTechsBase;
      const schedRes = await wx.cloud.callFunction({
        name: 'getSchedule', data: { dateFrom: weekStart, dateTo: weekEnd },
      });
      const schedMap = {};
      for (const s of (schedRes.result.schedules || [])) schedMap[`${s.techId}_${s.date}`] = s;

      const today = _today();
      const DAY_LABELS = ['周日','周一','周二','周三','周四','周五','周六'];
      const staffWeekCols = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart + 'T00:00:00');
        d.setDate(d.getDate() + i);
        const dateStr = _fmt(d);
        staffWeekCols.push({ dateStr, dayLabel: DAY_LABELS[d.getDay()], dayNum: d.getDate(), isToday: dateStr === today });
      }
      const staffWeekRows = techs.map(t => ({
        techId: t._id, name: t.name, nameInitial: (t.name || '?').slice(0, 1), avatar: t.avatar || '',
        cells: staffWeekCols.map(col => {
          const s = schedMap[`${t._id}_${col.dateStr}`];
          if (!s)           return { state: 'unset' };
          if (!s.isWorking) return { state: 'off' };
          const ws = s.workStart || '10:00', we = s.workEnd || '22:00';
          return { state: 'working', workStart: ws, workEnd: we };
        }),
      }));
      this.setData({ staffWeekCols, staffWeekRows });
    } catch (e) { console.error('loadStaffWeekView:', e); }
    finally { this.setData({ staffWeekLoading: false }); }
  },

  async loadStaffMonthView() {
    const { staffMonthStr } = this.data;
    const [y, mo] = staffMonthStr.split('-').map(Number);
    const lastDay    = new Date(y, mo, 0).getDate();
    const monthStart = `${staffMonthStr}-01`;
    const monthEnd   = `${staffMonthStr}-${String(lastDay).padStart(2, '0')}`;
    this.setData({ staffMonthLoading: true, staffMonthDays: [] });
    try {
      if (!this._ganttTechsBase) {
        const r = await wx.cloud.database().collection('technicians').orderBy('order', 'asc').get();
        this._ganttTechsBase = r.data;
      }
      const schedRes = await wx.cloud.callFunction({
        name: 'getSchedule', data: { dateFrom: monthStart, dateTo: monthEnd },
      });
      const workMap = {};
      for (const s of (schedRes.result.schedules || [])) {
        if (!workMap[s.date]) workMap[s.date] = { working: 0, off: 0 };
        s.isWorking ? workMap[s.date].working++ : workMap[s.date].off++;
      }
      const today    = _today();
      const firstDow = (new Date(y, mo - 1, 1).getDay() + 6) % 7;
      const cells    = [];
      for (let i = 0; i < firstDow; i++) cells.push({ empty: true });
      for (let d = 1; d <= lastDay; d++) {
        const dateStr = `${staffMonthStr}-${String(d).padStart(2, '0')}`;
        const w = workMap[dateStr] || { working: 0, off: 0 };
        cells.push({ empty: false, day: d, dateStr, isToday: dateStr === today,
          workingCount: w.working, offCount: w.off });
      }
      this.setData({ staffMonthDays: cells });
    } catch (e) { console.error('loadStaffMonthView:', e); }
    finally { this.setData({ staffMonthLoading: false }); }
  },

  prevStaffWeek() {
    const dt = new Date(this.data.staffWeekStart + 'T00:00:00');
    dt.setDate(dt.getDate() - 7);
    const ws = _fmt(dt);
    this.setData({ staffWeekStart: ws, staffWeekLabel: _staffWeekLabel(ws, _weekEnd(ws)) });
    this.loadStaffWeekView();
  },
  nextStaffWeek() {
    const dt = new Date(this.data.staffWeekStart + 'T00:00:00');
    dt.setDate(dt.getDate() + 7);
    const ws = _fmt(dt);
    this.setData({ staffWeekStart: ws, staffWeekLabel: _staffWeekLabel(ws, _weekEnd(ws)) });
    this.loadStaffWeekView();
  },
  prevStaffMonth() {
    const [y, m] = this.data.staffMonthStr.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    const mo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.setData({ staffMonthStr: mo, staffMonthLabel: _fmtMonthLabel(mo) });
    this.loadStaffMonthView();
  },
  nextStaffMonth() {
    const [y, m] = this.data.staffMonthStr.split('-').map(Number);
    const d = new Date(y, m, 1);
    const mo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.setData({ staffMonthStr: mo, staffMonthLabel: _fmtMonthLabel(mo) });
    this.loadStaffMonthView();
  },

  onStaffWeekDayTap(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    const today = _today();
    this.setData({ staffView: 'day', staffDate: date, staffIsToday: date === today, staffDateLabel: _staffDateLabel(date) });
    this.loadStaffView();
  },
  onStaffMonthDayTap(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    const today = _today();
    this.setData({ staffView: 'day', staffDate: date, staffIsToday: date === today, staffDateLabel: _staffDateLabel(date) });
    this.loadStaffView();
  },

  // ── Staff schedule day view ───────────────────────────────────────────────
  async loadStaffView() {
    const date = this.data.staffDate;
    this.setData({ staffLoading: true, staffRows: [] });
    try {
      if (!this._ganttTechsBase) {
        const r = await wx.cloud.database().collection('technicians').orderBy('order', 'asc').get();
        this._ganttTechsBase = r.data;
      }
      const techs = this._ganttTechsBase;
      const schedRes = await wx.cloud.callFunction({ name: 'getSchedule', data: { date } });
      const schedMap = {};
      for (const s of (schedRes.result.schedules || [])) schedMap[s.techId] = s;

      const staffRows = techs.map(t => {
        const s = schedMap[t._id];
        const nameInitial = (t.name || '?').slice(0, 1);
        const base = { techId: t._id, name: t.name, avatar: t.avatar || '', nameInitial };
        if (!s)            return { ...base, state: 'unset' };
        if (!s.isWorking)  return { ...base, state: 'off' };
        const workStart = s.workStart || '10:00';
        const workEnd   = s.workEnd   || '22:00';
        const { barLeft, barWidth } = _barPos(workStart, workEnd);
        return { ...base, state: 'working', workStart, workEnd,
          hours: _calcHours(workStart, workEnd), barLeft, barWidth };
      });
      this.setData({ staffRows });
    } catch (e) {
      console.error('loadStaffView:', e);
    } finally {
      this.setData({ staffLoading: false });
    }
  },

  prevStaffDate() {
    const dt = new Date(this.data.staffDate + 'T00:00:00');
    dt.setDate(dt.getDate() - 1);
    this._switchStaffDate(_fmt(dt));
  },

  nextStaffDate() {
    const dt = new Date(this.data.staffDate + 'T00:00:00');
    dt.setDate(dt.getDate() + 1);
    this._switchStaffDate(_fmt(dt));
  },

  _switchStaffDate(date) {
    const today = _today();
    this.setData({
      staffDate: date,
      staffIsToday: date === today,
      staffDateLabel: _staffDateLabel(date),
    });
    this.loadStaffView();
  },

  goTechSchedule(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/admin/tech-schedule/index?techId=${id}&name=${encodeURIComponent(name)}` });
  },

  // ── 关联会员 ─────────────────────────────────────────────────────────────
  openLinkMemberModal() {
    const bk = this.data.detailBooking;
    if (!bk) return;
    this.setData({
      showLinkMemberModal: true,
      linkingBookingId:    bk._id,
      linkQuery:           bk.phone || '',
      linkSearchResult:    null,
      linkSearchLoading:   false,
    });
  },

  onLinkQueryInput(e) {
    this.setData({ linkQuery: e.detail.value, linkSearchResult: null });
  },

  async searchMemberForLink() {
    const query = (this.data.linkQuery || '').trim();
    if (!query) { wx.showToast({ title: '请输入手机号或会员号', icon: 'none' }); return; }
    this.setData({ linkSearchLoading: true, linkSearchResult: null });
    try {
      const res = await wx.cloud.callFunction({
        name: 'linkGuestBooking',
        data: { action: 'search', query },
      });
      if (res.result.success) {
        this.setData({ linkSearchResult: res.result.member });
      } else {
        wx.showToast({ title: res.result.error || '未找到会员', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '搜索失败', icon: 'none' });
    } finally {
      this.setData({ linkSearchLoading: false });
    }
  },

  async confirmLinkMember() {
    const { linkingBookingId, linkSearchResult } = this.data;
    if (!linkSearchResult) return;
    wx.showLoading({ title: '关联中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'linkGuestBooking',
        data: { action: 'link', bookingId: linkingBookingId, memberOpenId: linkSearchResult.openId },
      });
      wx.hideLoading();
      if (res.result.success) {
        wx.showToast({ title: `已关联 ${res.result.memberName}`, icon: 'success' });
        this.setData({ showLinkMemberModal: false, showBookingDetail: false, detailBooking: null });
        // 刷新当前视图
        if (this.data.adminTab === 'schedule') this.loadGantt();
        else if (this.data.adminTab === 'bookings') this.loadBookings?.();
      } else {
        wx.showToast({ title: res.result.error || '关联失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  closeLinkMemberModal() {
    this.setData({ showLinkMemberModal: false, linkSearchResult: null, linkQuery: '' });
  },

  noop() {},

  // ── Quotes tab ───────────────────────────────────────────────────────────
  async _refreshQuotePendingCount() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getQuoteRequests', data: {} });
      if (res.result.success) {
        const pending = res.result.quotes.filter(q => q.status === 'pending').length;
        this.setData({ quotePendingCount: pending });
        // If already on schedule tab, update the full list too
        if (this.data.adminTab === 'schedule') {
          const quotes = res.result.quotes;
          this.setData({ quotes });
          this._applyQuoteFilter(this.data.quoteFilter, quotes);
        }
      }
    } catch (_) {}
  },

  async loadQuotes() {
    this.setData({ quotesLoading: true });
    try {
      // Ensure technicians are loaded for the qsheet tech picker
      if (!this.data.technicians.length) {
        const db = wx.cloud.database();
        const tr = await db.collection('technicians').orderBy('order', 'asc').get();
        this.setData({ technicians: tr.data });
      }
      // Load service categories for the quote category picker (if not already loaded)
      if (!this.data.quoteCategories.length) {
        try {
          const catRes = await wx.cloud.callFunction({ name: 'getServices' });
          if (catRes.result.success) {
            this.setData({
              quoteCategories:  catRes.result.categories || [],
              quoteAllServices: catRes.result.services   || [],
            });
          }
        } catch (_) { /* non-critical */ }
      }
      const res = await wx.cloud.callFunction({ name: 'getQuoteRequests', data: {} });
      if (res.result.success) {
        const quotes = res.result.quotes;
        const pending = quotes.filter(q => q.status === 'pending').length;
        this.setData({ quotes, quotePendingCount: pending });
        this._applyQuoteFilter(this.data.quoteFilter, quotes);
      } else {
        console.error('loadQuotes error:', res.result.error);
        wx.showToast({ title: res.result.error || '加载报价失败', icon: 'none' });
      }
    } catch (e) {
      console.error('loadQuotes exception:', e);
      wx.showToast({ title: e.message || '报价列表加载失败', icon: 'none' });
    } finally {
      this.setData({ quotesLoading: false });
    }
  },

  _applyQuoteFilter(filter, quotes) {
    const all = quotes || this.data.quotes;
    let filtered;
    if (filter === 'active') {
      filtered = all.filter(q => q.status === 'pending');
    } else if (filter === 'quoted') {
      filtered = all.filter(q => q.status === 'quoted');
    } else {
      filtered = all.filter(q => q.status === 'confirmed');
    }
    this.setData({ filteredQuotes: filtered, quoteFilter: filter });
  },

  setQuoteFilter(e) {
    this._applyQuoteFilter(e.currentTarget.dataset.f);
  },

  toggleQuotesSection() {
    this.setData({ showQuotesSection: !this.data.showQuotesSection });
  },

  openQuoteSheet(e) {
    const id = e.currentTarget.dataset.id;
    const quote = this.data.quotes.find(q => q._id === id);
    if (!quote) return;
    // Default category: 款式系列 (cat_style); fallback to first category
    const cats = this.data.quoteCategories;
    const defaultCat = cats.find(c => c._id === 'cat_style') || cats[0] || null;
    const quoteServices = defaultCat
      ? this.data.quoteAllServices.filter(s => s.categoryId === defaultCat._id)
      : [];
    this.setData({
      showQuoteSheet: true,
      activeQuote: quote,
      quoteServices,
      quoteForm: {
        categoryId:  defaultCat ? defaultCat._id  : '',
        mainService: defaultCat ? defaultCat.name : '',
        serviceId: '', serviceName: '',
        addons: [], addonsMap: {}, durationMin: '', price: '', techId: '', techName: '', adminNote: '',
      },
    });
  },

  closeQuoteSheet() { this.setData({ showQuoteSheet: false, activeQuote: null }); },

  setQuoteMainService(e) {
    const cat = e.currentTarget.dataset.cat;
    const already = this.data.quoteForm.categoryId === cat._id;
    const categoryId  = already ? '' : cat._id;
    const mainService = already ? '' : cat.name;
    const quoteServices = already ? [] : this.data.quoteAllServices.filter(s => s.categoryId === cat._id);
    this.setData({
      'quoteForm.categoryId':  categoryId,
      'quoteForm.mainService': mainService,
      'quoteForm.serviceId':   '',
      'quoteForm.serviceName': '',
      quoteServices,
    });
  },

  setQuoteService(e) {
    const svc = e.currentTarget.dataset.svc;
    const already = this.data.quoteForm.serviceId === svc._id;
    this.setData({
      'quoteForm.serviceId':   already ? '' : svc._id,
      'quoteForm.serviceName': already ? '' : svc.name,
    });
  },

  toggleQuoteAddon(e) {
    const tag = e.currentTarget.dataset.tag;
    const { addons, addonsMap } = this.data.quoteForm;
    const newAddons = addonsMap[tag] ? addons.filter(a => a !== tag) : [...addons, tag];
    const newMap = Object.fromEntries(newAddons.map(a => [a, true]));
    this.setData({ 'quoteForm.addons': newAddons, 'quoteForm.addonsMap': newMap });
  },

  setQuoteTech(e) {
    this.setData({ 'quoteForm.techId': e.currentTarget.dataset.id, 'quoteForm.techName': e.currentTarget.dataset.name });
  },

  onQuoteInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`quoteForm.${field}`]: e.detail.value });
  },

  async submitQuote() {
    const { quoteForm, activeQuote } = this.data;
    if (!quoteForm.price)  { wx.showToast({ title: '请填写报价金额', icon: 'none' }); return; }
    if (!quoteForm.techId) { wx.showToast({ title: '请选择推荐技师', icon: 'none' }); return; }
    wx.showLoading({ title: '发送中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'processQuote',
        data: {
          quoteId:     activeQuote._id,
          categoryId:  quoteForm.categoryId,
          mainService: quoteForm.mainService,
          serviceId:   quoteForm.serviceId,
          serviceName: quoteForm.serviceName,
          addons:      quoteForm.addons,
          durationMin: Number(quoteForm.durationMin) || 90,
          price:       Number(quoteForm.price),
          techId:      quoteForm.techId,
          techName:    quoteForm.techName,
          adminNote:   quoteForm.adminNote,
        },
      });
      wx.hideLoading();
      if (res.result.success) {
        wx.showToast({ title: '报价已发送', icon: 'success' });
        this.setData({ showQuoteSheet: false, activeQuote: null });
        this.loadQuotes();
      } else {
        wx.showToast({ title: res.result.error || '发送失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  goBack()      { wx.navigateBack(); },

  goTechProfile() {
    const techId = this.data.linkedTechId;
    if (techId) {
      wx.navigateTo({ url: `/pages/admin/tech-edit/index?id=${techId}` });
    } else {
      wx.showToast({ title: '未关联技师档案', icon: 'none' });
    }
  },

  goMySchedule() {
    const techId = this.data.linkedTechId;
    if (!techId) { wx.showToast({ title: '未关联技师档案', icon: 'none' }); return; }
    wx.navigateTo({ url: `/pages/admin/tech-schedule/index?techId=${techId}&name=${encodeURIComponent('我的排班')}&mode=tech` });
  },

  goBookings() {
    const { linkedTechId } = this.data;
    const url = (this._mode === 'technician' && linkedTechId)
      ? `/pages/admin/bookings/index?techId=${linkedTechId}`
      : '/pages/admin/bookings/index';
    wx.navigateTo({ url });
  },

  goCreateBooking() {
    wx.navigateTo({ url: '/pages/admin/create-booking/index' });
  },

  goAllPending() {
    wx.navigateTo({ url: '/pages/admin/bookings/index?status=pending' });
  },

  goBookingsWithStatus(e) {
    const status = e.currentTarget.dataset.status;
    wx.navigateTo({ url: `/pages/admin/bookings/index?status=${status}&today=1` });
  },
});
