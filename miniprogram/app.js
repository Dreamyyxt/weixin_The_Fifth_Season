// ⚠️  首次使用前，请将 ENV_ID 替换为你的云开发环境 ID
// 在微信开发者工具 → 云开发控制台 → 环境 ID 处获取
const ENV_ID = 'cloud1-6gnigk1y2964bc21';

App({
  globalData: {
    userInfo: {
      openId:       '',
      nickname:     '',
      avatarUrl:    '',
      vipLevel:     '普通会员',
      memberLevel:  0,
      points:       0,
      balance:      0,
      totalSpend:   0,
      totalTopUp:   0,
      bookingCount: 0,
      isRegistered: false,
      role:         'customer',
      linkedTechId: '',
    },
  },

  onLaunch() {
    wx.cloud.init({
      env: ENV_ID,
      traceUser: true,
    });

    // 从本地缓存恢复用户信息（仅作展示用，真实数据以云端为准）
    const stored = wx.getStorageSync('userInfo');
    if (stored && stored.isRegistered) {
      this.globalData.userInfo = stored;
    }
  },

  // 保存用户信息到内存和本地缓存（不直接写云端，由云函数处理）
  saveUserInfo(info) {
    Object.assign(this.globalData.userInfo, info);
    wx.setStorageSync('userInfo', this.globalData.userInfo);
  },

  // 获取云数据库实例（统一入口，便于全局使用）
  db() {
    return wx.cloud.database();
  },
});
