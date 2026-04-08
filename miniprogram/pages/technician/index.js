Page({
  data: {
    technicians: [],
    loading: true,
  },

  onShow() {
    this.fetchTechnicians();
  },

  async fetchTechnicians() {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('technicians')
        .orderBy('order', 'asc')
        .get();
      const technicians = res.data.map(t => ({
        ...t,
        avatarIsImg: !!(t.avatar && t.avatar.length > 10),
        available: null, // 等待 getAvailability 云函数计算，避免显示 DB 旧值
      }));
      this.setData({ technicians });
      // 后台刷新实时可用性（不阻塞列表展示）
      this.refreshAvailability(technicians);
    } catch (e) {
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
      console.error('fetchTechnicians:', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  async refreshAvailability(technicians) {
    try {
      const today = this.formatDate(new Date());
      const techIds = technicians.map(t => t._id);
      const res = await wx.cloud.callFunction({
        name: 'getAvailability',
        data: { techIds, date: today },
      });
      if (res.result.success) {
        const availability = res.result.result;
        const updated = this.data.technicians.map(t => ({
          ...t,
          available: availability[t._id]?.available ?? t.available,
        }));
        this.setData({ technicians: updated });
      }
    } catch (e) {
      console.error('refreshAvailability:', e);
    }
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  goBooking(e) {
    const techId = e.currentTarget.dataset.id;
    getApp().globalData.pendingBooking = { techId };
    wx.switchTab({ url: '/pages/booking-tab/index' });
  },
});
