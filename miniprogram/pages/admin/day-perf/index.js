const { statusBarHeight } = wx.getWindowInfo();
const NAV_TOP = statusBarHeight + 12;

Page({
  data: {
    navTopPadding: NAV_TOP,
    loading: true,
    date:     '',
    dateDisp: '',
    techId:   '',
    techPerf: [],
    totals:   { cashRevenue: 0, cardRevenue: 0, total: 0 },
  },

  onLoad(options) {
    const date   = options.date   || '';
    const techId = options.techId || '';
    this.setData({ date, techId });
    this.loadPerf(date || undefined, techId || undefined);
  },

  async loadPerf(date, techId) {
    this.setData({ loading: true });
    const callData = {};
    if (date)   callData.date   = date;
    if (techId) callData.techId = techId;
    try {
      const res = await wx.cloud.callFunction({
        name: 'adminGetDayPerf',
        data: callData,
      });
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '加载失败', icon: 'none' });
        return;
      }
      const r = res.result;
      // Format date for display: 'YYYY-MM-DD' → 'YYYY年MM月DD日'
      const dateDisp = r.date
        ? r.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日')
        : '';
      this.setData({
        date:     r.date,
        dateDisp,
        techPerf: r.techPerf || [],
        totals:   r.totals   || { cashRevenue: 0, cardRevenue: 0, total: 0 },
      });
    } catch (e) {
      wx.showToast({ title: '网络错误', icon: 'none' });
      console.error('day-perf loadPerf:', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  goBack() {
    wx.navigateBack();
  },
});
