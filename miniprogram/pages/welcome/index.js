const app = getApp();

Page({
  data: {
    avatarUrl: '',
    nickname: '',
    memberNo: '',
    vipLevel: '',
    petals: [],
    showBrand: false,
    showAvatar: false,
    showInfo: false,
    showCard: false,
    showBtn: false,
  },

  onLoad() {
    const u = app.globalData.userInfo;

    // 生成花瓣数据（随机位置、大小、动画时长）
    const petals = [];
    for (let i = 0; i < 12; i++) {
      petals.push({
        id: i,
        left: 4 + Math.floor(Math.random() * 92),
        size: 16 + Math.floor(Math.random() * 14),
        delay: 800 + Math.floor(Math.random() * 3600),
        duration: 4500 + Math.floor(Math.random() * 3000),
        type: i % 3,
      });
    }

    this.setData({
      avatarUrl: u.avatarUrl || '',
      nickname: u.nickname || '会员',
      memberNo: u.memberNo || '',
      vipLevel: u.vipLevel || '普通会员',
      petals,
    });

    // 依次触发各元素进场动画
    setTimeout(() => this.setData({ showBrand: true }), 200);
    setTimeout(() => this.setData({ showAvatar: true }), 500);
    setTimeout(() => this.setData({ showInfo: true }), 800);
    setTimeout(() => this.setData({ showCard: true }), 1050);
    setTimeout(() => this.setData({ showBtn: true }), 1300);
  },

  enterApp() {
    wx.reLaunch({ url: '/pages/index/index' });
  },
});
