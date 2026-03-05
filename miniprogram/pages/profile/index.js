const app = getApp();

Page({
  data: {
    userInfo: {},
    bookingRecords: [
      { id: 1, tech: '小雅', service: '日式凝胶美甲', date: '2026-02-28', time: '14:00', status: 'done', statusLabel: '已完成', price: 300 },
      { id: 2, tech: '晓晓', service: '嫁接睫毛', date: '2026-02-15', time: '10:30', status: 'done', statusLabel: '已完成', price: 200 },
      { id: 3, tech: '可可', service: 'VIP 高定全套', date: '2026-03-10', time: '15:00', status: 'pending', statusLabel: '待确认', price: 1000 },
    ],
    pointsLogs: [
      { id: 1, desc: '消费奖励', points: '+30', time: '2026-02-28', type: 'earn' },
      { id: 2, desc: '发帖奖励', points: '+10', time: '2026-02-26', type: 'earn' },
      { id: 3, desc: '兑换徽章', points: '-800', time: '2026-02-20', type: 'spend' },
      { id: 4, desc: '发帖奖励', points: '+10', time: '2026-02-18', type: 'earn' },
      { id: 5, desc: '消费奖励', points: '+20', time: '2026-02-15', type: 'earn' },
    ],
    activeSection: 'booking',
  },

  onShow() {
    this.setData({ userInfo: app.globalData.userInfo });
  },

  goEdit() {
    wx.navigateTo({ url: '/pages/login/index?mode=edit' });
  },

  switchSection(e) {
    this.setData({ activeSection: e.currentTarget.dataset.sec });
  },

  showRecharge() {
    wx.showModal({
      title: '充值余额',
      content: '充值功能需要接入支付，请联系店铺管理员配置微信支付。',
      showCancel: false,
      confirmText: '知道了',
    });
  },
});
