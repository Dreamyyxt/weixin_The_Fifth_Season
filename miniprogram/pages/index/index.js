const app = getApp();

Page({
  data: {
    banners: [
      { id: 1, theme: 'spring', title: '春日樱花款', subtitle: '限时特供 · 日式凝胶', tag: '新品' },
      { id: 2, theme: 'summer', title: '夏日渐变款', subtitle: '高定系列 · 从 ¥300 起', tag: '热销' },
      { id: 3, theme: 'vip', title: 'VIP Room 专属', subtitle: '私人定制 · 从 ¥1000 起', tag: 'VIP' },
    ],
    notices: [
      '本店宠物友好，欢迎携带毛孩子',
      'VIP Room 预约请提前3天',
      '发帖晒图可获得积分奖励',
    ],
    noticeIndex: 0,
    technicians: [],
    showTechDetail: false,
    selectedTech: null,
  },

  onLoad() {
    if (!app.globalData.userInfo.isRegistered) {
      wx.reLaunch({ url: '/pages/login/index' });
      return;
    }
    this.startNoticeTimer();
    this.loadTechnicians();
  },

  onShow() {
    if (!app.globalData.userInfo.isRegistered) {
      wx.reLaunch({ url: '/pages/login/index' });
      return;
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  onUnload() {
    if (this.noticeTimer) clearInterval(this.noticeTimer);
  },

  startNoticeTimer() {
    this.noticeTimer = setInterval(() => {
      const next = (this.data.noticeIndex + 1) % this.data.notices.length;
      this.setData({ noticeIndex: next });
    }, 3000);
  },

  async loadTechnicians() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('technicians').orderBy('order', 'asc').get();
      const technicians = res.data.map(t => ({
        ...t,
        avatarIsImg: !!(t.avatar && t.avatar.length > 10),
      }));
      this.setData({ technicians });
    } catch (e) {
      console.error('loadTechnicians:', e);
    }
  },

  openTechDetail(e) {
    const id = e.currentTarget.dataset.id;
    const tech = this.data.technicians.find(t => t._id === id);
    if (tech) this.setData({ showTechDetail: true, selectedTech: tech });
  },

  closeTechDetail() {
    this.setData({ showTechDetail: false, selectedTech: null });
  },

  goBookingFromDetail() {
    const tech = this.data.selectedTech;
    this.setData({ showTechDetail: false });
    getApp().globalData.pendingBooking = { techId: tech._id };
    wx.switchTab({ url: '/pages/booking-tab/index' });
  },

  noop() {},

  goBooking() {
    wx.switchTab({ url: '/pages/booking-tab/index' });
  },

  goShop() {
    wx.switchTab({ url: '/pages/shop/index' });
  },

  goCommunity() {
    wx.switchTab({ url: '/pages/community/index' });
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/index' });
  },
});
