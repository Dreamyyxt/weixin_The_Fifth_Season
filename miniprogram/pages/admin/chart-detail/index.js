const { drawLine, drawMultiLine } = require('../../../utils/chartHelper');

const { statusBarHeight } = wx.getWindowInfo();
const NAV_TOP = statusBarHeight + 12;

// Color palette for the 3 booking series
const BOOKING_SERIES_COLORS = ['#C8847A', '#5BBCAA', '#E8A898'];
const BOOKING_SERIES_NAMES  = ['总预约', '已完成', '已取消'];

const CHART_META = {
  bookings: { title: '预约量趋势', color: '#C8847A', showTotal: true,  isMulti: true  },
  revenue:  { title: '营业额增长', color: '#C9A76B', showTotal: true,  isMulti: false },
  avg:      { title: '平均客单价', color: '#5BBCAA', showTotal: false, isMulti: false },
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

Page({
  data: {
    navTopPadding: NAV_TOP,
    type:       'bookings',
    title:      '预约量趋势',
    color:      '#C8847A',
    showTotal:  true,
    isMulti:    true,
    chartRange: 7,
    // Custom date range
    customMode:  false,
    customStart: '',
    customEnd:   '',
    loading: true,
    dailyStats: [],
    // Single-line stats
    totalVal: 0,
    avgVal:   0,
    maxVal:   0,
    // Multi-line stats (bookings type)
    multiStats: [],
    // Chart legend (multi-line)
    seriesLegend: [],
  },

  _canvasReady: false,
  _canvasCtx:   null,
  _canvasW:     0,
  _canvasH:     0,
  _chartPts:    null,  // Array<Array<pt>> — one inner array per series

  onLoad(options) {
    const type = options.type || 'bookings';
    const meta = CHART_META[type] || CHART_META.bookings;
    const seriesLegend = meta.isMulti
      ? BOOKING_SERIES_COLORS.map((c, i) => ({ color: c, name: BOOKING_SERIES_NAMES[i] }))
      : [];
    this.setData({ type, title: meta.title, color: meta.color, showTotal: meta.showTotal, isMulti: meta.isMulti, seriesLegend });
    this.loadData();
  },

  onReady() {
    this._canvasReady = true;
    this._tryDraw();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const { chartRange, customMode, customStart, customEnd } = this.data;
      const callData = customMode && customStart && customEnd
        ? { startDate: customStart, endDate: customEnd }
        : { chartRange };

      const res = await wx.cloud.callFunction({ name: 'adminGetStats', data: callData });
      if (!res.result.success) {
        wx.showToast({ title: '加载失败', icon: 'none' });
        return;
      }
      const dailyStats = res.result.dailyStats || [];
      this._computeStats(dailyStats);
      wx.nextTick(() => wx.nextTick(() => this._tryDraw()));
    } catch (e) {
      wx.showToast({ title: '网络错误', icon: 'none' });
      console.error('chart-detail loadData:', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  _computeStats(dailyStats) {
    const { type } = this.data;
    if (type === 'bookings') {
      // Multi-line: compute stats for each of the 3 series
      const keys = ['bookingCount', 'completedCount', 'cancelledCount'];
      const multiStats = keys.map((key, i) => {
        const vals = dailyStats.map(d => d[key] || 0);
        const total = vals.reduce((s, v) => s + v, 0);
        const avg   = vals.length > 0 ? Math.round(total / vals.length) : 0;
        const max   = vals.length > 0 ? Math.max(...vals) : 0;
        return { name: BOOKING_SERIES_NAMES[i], color: BOOKING_SERIES_COLORS[i], total, avg, max };
      });
      this.setData({ dailyStats, multiStats });
    } else {
      const points = this._getPoints(dailyStats);
      const maxVal = points.length > 0 ? Math.max(...points.map(p => p.value)) : 0;
      let totalVal, avgVal;
      if (type === 'avg') {
        // True average: total revenue / total completed across the period
        const totalRevenue  = dailyStats.reduce((s, d) => s + (d.revenue       || 0), 0);
        const totalComplete = dailyStats.reduce((s, d) => s + (d.completedCount || 0), 0);
        avgVal   = totalComplete > 0 ? Math.round(totalRevenue / totalComplete) : 0;
        totalVal = 0;
      } else {
        totalVal = points.reduce((s, p) => s + p.value, 0);
        avgVal   = points.length > 0 ? Math.round(totalVal / points.length) : 0;
      }
      this.setData({ dailyStats, totalVal, avgVal, maxVal });
    }
  },

  // Build data points for single-line charts
  _getPoints(dailyStats) {
    const { type } = this.data;
    return dailyStats.map(d => {
      let value;
      if (type === 'bookings')     value = d.bookingCount;
      else if (type === 'revenue') value = d.revenue;
      else /* avg */               value = (d.completedCount || 0) > 0
        ? Math.round(d.revenue / d.completedCount) : 0;
      return { value, label: d.date };
    });
  },

  // Build the 3-series array for the multi-line bookings chart
  _buildSeries(dailyStats) {
    const keys = ['bookingCount', 'completedCount', 'cancelledCount'];
    return keys.map((key, i) => ({
      name:   BOOKING_SERIES_NAMES[i],
      color:  BOOKING_SERIES_COLORS[i],
      points: dailyStats.map(d => ({ value: d[key] || 0, label: d.date })),
    }));
  },

  _tryDraw() {
    if (!this._canvasReady || this.data.loading) return;
    const { dailyStats, color, isMulti } = this.data;
    const query = wx.createSelectorQuery().in(this);
    query.select('#detail-chart').fields({ node: true, size: true }).exec(([res]) => {
      if (!res || !res.node) return;
      const canvas = res.node;
      const dpr = wx.getWindowInfo().pixelRatio;
      canvas.width  = res.width  * dpr;
      canvas.height = res.height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      this._canvasCtx = ctx;
      this._canvasW   = res.width;
      this._canvasH   = res.height;
      if (isMulti) {
        this._chartPts = drawMultiLine(ctx, res.width, res.height, this._buildSeries(dailyStats));
      } else {
        this._chartPts = [drawLine(ctx, res.width, res.height, this._getPoints(dailyStats), color)];
      }
    });
  },

  onChartTouch(e) {
    if (!this._chartPts || !this._chartPts[0] || !this._chartPts[0].length || !this._canvasCtx) return;
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!touch) return;

    const touchX = touch.x;
    let nearestIdx = 0;
    let minDist    = Infinity;
    this._chartPts[0].forEach((p, i) => {
      const dist = Math.abs(p.x - touchX);
      if (dist < minDist) { minDist = dist; nearestIdx = i; }
    });

    const { dailyStats, color, isMulti } = this.data;
    const highlights = this._chartPts.map(pts => pts[nearestIdx] || null);

    if (isMulti) {
      drawMultiLine(this._canvasCtx, this._canvasW, this._canvasH, this._buildSeries(dailyStats), highlights);
    } else {
      drawLine(this._canvasCtx, this._canvasW, this._canvasH, this._getPoints(dailyStats), color, highlights[0]);
    }
  },

  // Range tab buttons
  switchRange(e) {
    const range = parseInt(e.currentTarget.dataset.range);
    this._chartPts = null;
    this.setData({ chartRange: range, customMode: false }, () => this.loadData());
  },

  toggleCustom() {
    const today = todayStr();
    this.setData({
      customMode:  true,
      customStart: this.data.customStart || today,
      customEnd:   this.data.customEnd   || today,
    });
  },

  onStartChange(e) {
    this.setData({ customStart: e.detail.value });
  },

  onEndChange(e) {
    this.setData({ customEnd: e.detail.value });
  },

  applyCustomRange() {
    const { customStart, customEnd } = this.data;
    if (!customStart || !customEnd) {
      wx.showToast({ title: '请选择开始和结束日期', icon: 'none' }); return;
    }
    if (customEnd < customStart) {
      wx.showToast({ title: '结束日期不能早于开始日期', icon: 'none' }); return;
    }
    const days = (new Date(customEnd) - new Date(customStart)) / 86400000;
    if (days > 180) {
      wx.showToast({ title: '自定义范围最多 180 天', icon: 'none' }); return;
    }
    this._chartPts = null;
    this.loadData();
  },

  goBack() { wx.navigateBack(); },
});
