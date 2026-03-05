const app = getApp();

Page({
  data: {
    banners: [
      { id: 1, theme: 'spring', title: '春日樱花款', subtitle: '限时特供 · 日式凝胶', tag: '新品' },
      { id: 2, theme: 'summer', title: '夏日渐变款', subtitle: '高定系列 · 从 ¥300 起', tag: '热销' },
      { id: 3, theme: 'vip', title: 'VIP Room 专属', subtitle: '私人定制 · 从 ¥1000 起', tag: 'VIP' },
    ],
    works: [
      { id: 1, color: 'pink', emoji: '🌸', label: '樱花白' },
      { id: 2, color: 'coral', emoji: '🪸', label: '珊瑚橘' },
      { id: 3, color: 'lavender', emoji: '💜', label: '薰衣草' },
      { id: 4, color: 'gold', emoji: '✨', label: '复古金' },
      { id: 5, color: 'green', emoji: '🌿', label: '莫兰迪' },
      { id: 6, color: 'white', emoji: '🤍', label: '法式白' },
    ],
    notices: [
      '本店宠物友好，欢迎携带毛孩子',
      'VIP Room 预约请提前3天',
      '发帖晒图可获得积分奖励',
    ],
    noticeIndex: 0,
  },

  onLoad() {
    this.startNoticeTimer();
  },

  onShow() {
    // 未注册时跳转到登录页
    if (!app.globalData.userInfo.isRegistered) {
      wx.navigateTo({ url: '/pages/login/index' });
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

  goTechnician() {
    wx.switchTab({ url: '/pages/technician/index' });
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
