Page({
  data: {
    quoteId: '',
    quote: null,
    loading: true,
  },

  onLoad(options) {
    const id = options.id || '';
    this.setData({ quoteId: id });
    if (id) this.loadQuote(id);
  },

  onShow() {
    if (this.data.quoteId) this.loadQuote(this.data.quoteId);
  },

  async loadQuote(id) {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'getMyQuotes', data: { id } });
      if (!res.result.success) throw new Error(res.result.error || '加载失败');
      const q = res.result.quote;
      const diffMap = { simple: '简单', medium: '中等', complex: '复杂' };
      const dMin = q.durationMin || 0;
      const dDisplay = dMin
        ? (Math.floor(dMin / 60) > 0 ? `${Math.floor(dMin / 60)} 小时` : '') +
          (dMin % 60 > 0 ? ` ${dMin % 60} 分钟` : '')
        : '';
      this.setData({
        quote: {
          ...q,
          difficultyLabel: diffMap[q.difficulty] || q.difficulty || '',
          durationDisplay: dDisplay.trim(),
        },
        loading: false,
      });
    } catch (e) {
      console.error('loadQuote:', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  goBook() {
    const { quote } = this.data;
    getApp().globalData.pendingBooking = {
      techId:          quote.recommendedTechId,
      quoteId:         quote._id,
      quotePrice:      quote.price      || 0,
      quoteDurationMin: quote.durationMin || 90,
    };
    wx.switchTab({ url: '/pages/booking-tab/index' });
  },

  async resubmit() {
    wx.showModal({
      title: '重新提交报价申请',
      content: '将以相同的参考图片重新发起报价，是否确认？',
      confirmText: '确认重提',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '提交中...' });
        try {
          const r = await wx.cloud.callFunction({
            name: 'getMyQuotes',
            data: { action: 'resubmit', id: this.data.quoteId },
          });
          wx.hideLoading();
          if (r.result.success) {
            wx.showToast({ title: '已重新提交', icon: 'success' });
            setTimeout(() => this.loadQuote(this.data.quoteId), 800);
          } else {
            wx.showToast({ title: r.result.error || '提交失败', icon: 'none' });
          }
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      },
    });
  },

  async reject() {
    wx.showModal({
      title: '放弃本次报价',
      content: '确定放弃吗？您可以随时重新提交报价申请。',
      confirmText: '确定放弃',
      confirmColor: '#E74C3C',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...' });
        try {
          const db = wx.cloud.database();
          await db.collection('quoteRequests').doc(this.data.quoteId).update({
            data: { status: 'rejected' },
          });
          wx.hideLoading();
          wx.showToast({ title: '已放弃', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 800);
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
    });
  },
});
