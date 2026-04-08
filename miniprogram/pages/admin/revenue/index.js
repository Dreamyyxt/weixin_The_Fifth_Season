const { statusBarHeight } = wx.getWindowInfo();
const NAV_TOP = statusBarHeight + 12;

const PAY_METHODS = ['wechat', 'cash', 'card', 'alipay_offline'];
const PAY_LABEL   = { wechat: '微信支付', cash: '现金', card: '刷卡', alipay_offline: '支付宝' };
const PAY_ICON    = { wechat: '💬', cash: '💵', card: '💳', alipay_offline: '🔵' };

Page({
  data: {
    navTopPadding: NAV_TOP,
    date: '',
    loading: false,
    summary: null,
    methodRows: [],
    bookings: [],
    auditConfirmed: null,
    // 日历
    calMonth:      '',
    calMonthLabel: '',
    calDays:       [],
    calRevenueMap: {},
    calLoading:    false,
    // 对账确认弹窗
    showAuditModal: false,
    auditCashInput: '',
    auditNote: '',
    auditSaving: false,
  },

  onLoad() {
    const today = this._today();
    const calMonth = today.slice(0, 7);
    this.setData({ date: today, calMonth, calMonthLabel: this._fmtCalMonth(calMonth) });
    this.loadCalMonth(calMonth, today);
    this.loadReport(today);
  },

  // ─── 日历 ───────────────────────────────────────────────────────────────────

  _today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  _fmt(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  _fmtCalMonth(ym) {
    const [y, m] = ym.split('-');
    return `${y}年${m}月`;
  },

  _buildCalDays(year, month, revenueMap, selectedDate) {
    const today    = this._today();
    const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Mon-based
    const lastDay  = new Date(year, month, 0).getDate();
    const cells    = [];
    for (let i = 0; i < firstDow; i++) cells.push({ empty: true });
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      cells.push({
        empty:      false,
        day:        d,
        dateStr,
        isToday:    dateStr === today,
        isSel:      dateStr === selectedDate,
        hasRevenue: !!(revenueMap[dateStr]),
        revenue:    revenueMap[dateStr] || 0,
      });
    }
    return cells;
  },

  async loadCalMonth(ym, selectedDate) {
    this.setData({ calLoading: true });
    try {
      const [y, m] = ym.split('-').map(Number);
      const lastDay  = new Date(y, m, 0).getDate();
      const dateFrom = `${ym}-01`;
      const dateTo   = `${ym}-${String(lastDay).padStart(2,'0')}`;
      const res = await wx.cloud.callFunction({
        name: 'adminGetBookings',
        data: { dateFrom, dateTo, statusFilter: 'completed' },
      });
      const revenueMap = {};
      if (res.result.success) {
        (res.result.bookings || []).forEach(b => {
          if (b.paymentStatus === 'paid') {
            revenueMap[b.date] = (revenueMap[b.date] || 0) + (b.finalPrice || 0);
          }
        });
      }
      const sel = selectedDate || this.data.date;
      this.setData({
        calRevenueMap: revenueMap,
        calDays: this._buildCalDays(y, m, revenueMap, sel),
      });
    } catch (e) {
      console.error('loadCalMonth:', e);
    } finally {
      this.setData({ calLoading: false });
    }
  },

  prevCalMonth() {
    const [y, m] = this.data.calMonth.split('-').map(Number);
    const d  = new Date(y, m - 2, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    this.setData({ calMonth: ym, calMonthLabel: this._fmtCalMonth(ym) });
    this.loadCalMonth(ym);
  },

  nextCalMonth() {
    const [y, m] = this.data.calMonth.split('-').map(Number);
    const d  = new Date(y, m, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    this.setData({ calMonth: ym, calMonthLabel: this._fmtCalMonth(ym) });
    this.loadCalMonth(ym);
  },

  onCalDayTap(e) {
    const dateStr = e.currentTarget.dataset.date;
    if (!dateStr) return;
    const [y, m] = this.data.calMonth.split('-').map(Number);
    this.setData({
      date:    dateStr,
      calDays: this._buildCalDays(y, m, this.data.calRevenueMap, dateStr),
    });
    this.loadReport(dateStr);
  },

  // ─── 报表加载 ────────────────────────────────────────────────────────────────

  async loadReport(date) {
    this.setData({ loading: true, summary: null, bookings: [], methodRows: [], auditConfirmed: null });
    try {
      const res = await wx.cloud.callFunction({
        name: 'getRevenueReport',
        data: { date },
      });
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '加载失败', icon: 'none' });
        return;
      }
      const { summary, bookings, auditConfirmed } = res.result;
      const methodRows = PAY_METHODS
        .filter(m => summary.byMethod[m]?.count > 0)
        .map(m => ({
          key:    m,
          label:  PAY_LABEL[m],
          icon:   PAY_ICON[m],
          count:  summary.byMethod[m].count,
          amount: summary.byMethod[m].amount,
        }));
      this.setData({ summary, methodRows, bookings, auditConfirmed });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      console.error('loadReport:', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  // ─── 对账确认弹窗 ────────────────────────────────────────────────────────────

  openAuditModal() {
    const { summary, auditConfirmed } = this.data;
    const cashAmount = summary?.byMethod?.cash?.amount || 0;
    this.setData({
      showAuditModal: true,
      auditCashInput: auditConfirmed ? String(auditConfirmed.cashActual) : String(cashAmount),
      auditNote:      auditConfirmed?.note || '',
    });
  },

  closeAuditModal() {
    this.setData({ showAuditModal: false });
  },

  onAuditCashInput(e) { this.setData({ auditCashInput: e.detail.value }); },
  onAuditNoteInput(e) { this.setData({ auditNote:      e.detail.value }); },

  async confirmAudit() {
    const { date, auditCashInput, auditNote } = this.data;
    const cashActual = parseFloat(auditCashInput);
    if (isNaN(cashActual) || cashActual < 0) {
      wx.showToast({ title: '请输入有效现金金额', icon: 'none' }); return;
    }
    this.setData({ auditSaving: true });
    wx.showLoading({ title: '保存中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'confirmRevenueAudit',
        data: { date, cashActual, note: auditNote },
      });
      wx.hideLoading();
      if (res.result.success) {
        wx.showToast({ title: '对账已确认', icon: 'success' });
        this.setData({ showAuditModal: false });
        this.loadReport(date);
        // 刷新当月日历（对账后 dot 状态可能变化）
        this.loadCalMonth(this.data.calMonth, date);
      } else {
        wx.showToast({ title: res.result.error || '保存失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    } finally {
      this.setData({ auditSaving: false });
    }
  },

  goBack() { wx.navigateBack(); },
});
