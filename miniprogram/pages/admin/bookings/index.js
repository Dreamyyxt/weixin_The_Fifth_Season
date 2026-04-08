const app = getApp();

const { statusBarHeight } = wx.getWindowInfo();
const NAV_TOP = statusBarHeight + 12;

const SOURCE_LABEL = {
  phone: '电话预约', dianping: '大众点评', meituan: '美团',
  douyin: '抖音团购', walkin: '现场来客', other: '其他',
};

const STATUS_TABS = [
  { key: 'all',       label: '全部' },
  { key: 'pending',   label: '待确认' },
  { key: 'confirmed', label: '已确认' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
];

const STATUS_LABEL = {
  pending:   '待确认',
  confirmed: '已确认',
  completed: '已完成',
  cancelled: '已取消',
};

const PAY_METHOD_LABEL = {
  wechat:         '微信支付',
  cash:           '现金',
  card:           '刷卡',
  alipay_offline: '支付宝',
};

Page({
  data: {
    navTopPadding: NAV_TOP,
    role: app.globalData.userInfo.role || 'customer',
    linkedTechId: app.globalData.userInfo.linkedTechId || '',
    statusTabs: STATUS_TABS,
    activeTab: 'all',
    dateFilter: '',
    bookings: [],
    loading: false,
    // 内嵌日历
    calYear:  0,
    calMonth: 0,
    calDays:  [],
    pendingMap: {},
    // 标记完成弹窗
    showCompleteModal:   false,
    completingBooking:   null,
    completePriceInput:  '',
    completeFinalPrice:  0,
    completeRemainder:   0,
    // 确认收款弹窗
    showPayModal:        false,
    payingBooking:       null,
    selectedPayMethod:   'cash',
    // 技师模式：只显示该技师的预约
    techIdFilter:        '',
  },

  onLoad(options) {
    const today = this.today();
    const activeTab = options.status || 'all';
    const techIdFilter = options.techId || '';
    const dateFilter = options.today === '1' ? today
      : (options.status && !options.today) ? ''
      : today;
    const initDate = dateFilter ? new Date(dateFilter + 'T00:00:00') : new Date();
    const calYear  = initDate.getFullYear();
    const calMonth = initDate.getMonth() + 1;
    const calDays  = this._buildCalDays(calYear, calMonth, dateFilter);
    this.setData({ activeTab, dateFilter, calYear, calMonth, calDays, techIdFilter });
    this.loadBookings();
    this._loadPendingMap(calYear, calMonth);
    if (options.createNew === '1') this.openCreatePage();
  },

  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  async loadBookings() {
    this.setData({ loading: true });
    try {
      const { activeTab, dateFilter } = this.data;
      const { techIdFilter } = this.data;
      const res = await wx.cloud.callFunction({
        name: 'adminGetBookings',
        data: {
          dateFilter:   dateFilter || null,
          statusFilter: activeTab,
          ...(techIdFilter ? { techId: techIdFilter } : {}),
        },
      });
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '加载失败', icon: 'none' });
        return;
      }
      // 同步最新的 role / linkedTechId（防止缓存过期）
      const { role, linkedTechId } = res.result;
      const bookings = res.result.bookings.map(b => ({
        ...b,
        statusLabel:      STATUS_LABEL[b.status] || b.status,
        payMethodLabel:   PAY_METHOD_LABEL[b.paymentMethod] || '',
        guestSourceLabel: SOURCE_LABEL[b.guestSource] || '',
      }));
      this.setData({ bookings, role: role || this.data.role, linkedTechId: linkedTechId || '' });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      console.error('loadBookings:', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.key;
    this.setData({ activeTab: tab }, () => this.loadBookings());
  },

  // ─── 日历 ────────────────────────────────────────────────────────────────

  _fmt(dt) {
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  },

  _buildCalDays(year, month, selectedDate, pendingMap) {
    const todayStr  = this.today();
    const pm        = pendingMap || this.data.pendingMap || {};
    const startWday = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells = [];
    for (let i = startWday; i > 0; i--) cells.push(new Date(year, month - 1, 1 - i));
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month - 1, d));
    const trailing = 42 - cells.length;
    for (let d = 1; d <= trailing; d++) cells.push(new Date(year, month, d));
    return cells.map(dt => {
      const dateStr = this._fmt(dt);
      const cur = dt.getMonth() === month - 1 && dt.getFullYear() === year;
      return { day: dt.getDate(), dateStr, cur, past: dateStr < todayStr, today: dateStr === todayStr, sel: dateStr === selectedDate, pendingCount: pm[dateStr] || 0 };
    });
  },

  onCalDayTap(e) {
    const date = e.currentTarget.dataset.date;
    const newFilter = date === this.data.dateFilter ? '' : date;
    const { calYear, calMonth } = this.data;
    this.setData({
      dateFilter: newFilter,
      calDays: this._buildCalDays(calYear, calMonth, newFilter),
    }, () => this.loadBookings());
  },

  prevMonth() {
    let { calYear, calMonth, dateFilter } = this.data;
    calMonth--;
    if (calMonth < 1) { calMonth = 12; calYear--; }
    this.setData({ calYear, calMonth, pendingMap: {}, calDays: this._buildCalDays(calYear, calMonth, dateFilter, {}) });
    this._loadPendingMap(calYear, calMonth);
  },

  nextMonth() {
    let { calYear, calMonth, dateFilter } = this.data;
    calMonth++;
    if (calMonth > 12) { calMonth = 1; calYear++; }
    this.setData({ calYear, calMonth, pendingMap: {}, calDays: this._buildCalDays(calYear, calMonth, dateFilter, {}) });
    this._loadPendingMap(calYear, calMonth);
  },

  async _loadPendingMap(year, month) {
    try {
      const mo      = `${year}-${String(month).padStart(2, '0')}`;
      const lastDay = new Date(year, month, 0).getDate();
      const res = await wx.cloud.callFunction({
        name: 'adminGetBookings',
        data: { dateFrom: `${mo}-01`, dateTo: `${mo}-${String(lastDay).padStart(2,'0')}`, statusFilter: 'pending' },
      });
      if (!res.result.success) return;
      const pm = {};
      (res.result.bookings || []).forEach(b => { pm[b.date] = (pm[b.date] || 0) + 1; });
      const { calYear, calMonth, dateFilter } = this.data;
      // Only apply if still on the same month
      if (calYear === year && calMonth === month) {
        this.setData({ pendingMap: pm, calDays: this._buildCalDays(year, month, dateFilter, pm) });
      }
    } catch (_) {}
  },

  clearDate() {
    const { calYear, calMonth } = this.data;
    this.setData({
      dateFilter: '',
      calDays: this._buildCalDays(calYear, calMonth, ''),
    }, () => this.loadBookings());
  },

  async updateStatus(e) {
    const { id, status } = e.currentTarget.dataset;

    // 标记完成 → 走专属弹窗填写实际金额
    if (status === 'completed') {
      const booking = this.data.bookings.find(b => b._id === id);
      if (booking) this._openCompleteModal(booking);
      return;
    }

    const labels = { confirmed: '确认预约', cancelled: '取消预约' };
    wx.showModal({
      title: labels[status] || '更新状态',
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
            wx.showToast({ title: '已更新', icon: 'success' });
            this.loadBookings();
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
    const actualPrice  = booking.price || 0;
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
    const val        = e.detail.value;
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
        this.loadBookings();
      } else {
        wx.showToast({ title: result.result.error || '更新失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  // ─── 确认收款弹窗 ──────────────────────────────────────────────────────────

  openPayModal(e) {
    const id = e.currentTarget.dataset.id;
    const booking = this.data.bookings.find(b => b._id === id);
    if (!booking) return;
    this.setData({ showPayModal: true, payingBooking: booking, selectedPayMethod: 'cash' });
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
        this.setData({ showPayModal: false, payingBooking: null });
        wx.showToast({ title: '已确认收款', icon: 'success' });
        this.loadBookings();
      } else {
        wx.showToast({ title: result.result.error || '操作失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
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
            wx.showToast({ title: '已标记', icon: 'success' });
            this.loadBookings();
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

  // ─── 手动创建预约 ──────────────────────────────────────────────────────────

  openCreatePage() {
    wx.navigateTo({ url: '/pages/admin/create-booking/index' });
  },

  goBack() {
    wx.navigateBack();
  },
});
