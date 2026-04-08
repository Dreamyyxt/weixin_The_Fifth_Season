const app = getApp();

Page({
  data: {
    activeTab: 0,
    tabs: ['服务套餐', '积分兑换'],
    userPoints: 0,
    packages: [],
    redeemItems: [],
    loading: true,
  },

  onShow() {
    this.setData({ userPoints: app.globalData.userInfo.points || 0 });
    this.refreshUserPoints();
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  async refreshUserPoints() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('users').where({}).get();
      if (res.data && res.data.length > 0) {
        const points = res.data[0].points || 0;
        app.saveUserInfo({ points });
        this.setData({ userPoints: points });
      }
    } catch (e) {
      // 静默失败，保持缓存值
    }
  },

  onLoad() {
    this.fetchProducts();
  },

  async fetchProducts() {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('products').get();
      const packages    = res.data.filter(p => p.type === 'package');
      const redeemItems = res.data.filter(p => p.type === 'redeem');
      this.setData({ packages, redeemItems });
    } catch (e) {
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
      console.error('fetchProducts:', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  switchTab(e) {
    this.setData({ activeTab: parseInt(e.currentTarget.dataset.index) });
  },

  goPackageDetail(e) {
    wx.navigateTo({ url: `/pages/packageDetail/index?id=${e.currentTarget.dataset.id}` });
  },

  redeemItem(e) {
    const item = e.currentTarget.dataset.item;
    const userPoints = this.data.userPoints;

    if (userPoints < item.points) {
      wx.showModal({
        title: '积分不足',
        content: `兑换需要 ${item.points} 积分，您当前有 ${userPoints} 积分，还差 ${item.points - userPoints} 积分。`,
        showCancel: false,
        confirmText: '知道了',
      });
      return;
    }

    wx.showModal({
      title: `兑换 ${item.name}`,
      content: `需消耗 ${item.points} 积分\n当前积分：${userPoints}\n兑换后剩余：${userPoints - item.points}`,
      confirmText: '确认兑换',
      confirmColor: '#C9A76B',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '兑换中...' });
        try {
          const result = await wx.cloud.callFunction({
            name: 'redeemItem',
            data: {
              productId:   item._id,
              productName: item.name,
              points:      item.points,
            },
          });
          wx.hideLoading();
          if (result.result.success) {
            const newPoints = result.result.newPoints;
            app.saveUserInfo({ points: newPoints });
            this.setData({ userPoints: newPoints });
            wx.showToast({ title: '兑换成功！', icon: 'success' });
          } else {
            wx.showToast({ title: result.result.error || '兑换失败', icon: 'none' });
          }
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: '网络错误，请重试', icon: 'none' });
          console.error('redeemItem:', e);
        }
      },
    });
  },
});
