const app = getApp();

Page({
  data: {
    activeTab: 0,
    tabs: ['服务套餐', '积分兑换'],
    userPoints: 0,
    packages: [
      { id: 1, name: '樱花限定美甲套餐', desc: '日式凝胶 · 春日主题', price: 299, tag: '热销', emoji: '🌸', sold: 128 },
      { id: 2, name: '高级美睫套餐', desc: '嫁接睫毛 + 定妆', price: 399, tag: '新品', emoji: '👁️', sold: 56 },
      { id: 3, name: '美甲+美睫组合', desc: '双项优惠套餐', price: 599, tag: '优惠', emoji: '✨', sold: 89 },
      { id: 4, name: 'VIP 高定全套', desc: 'VIP Room 专属 · 高定款', price: 1000, tag: 'VIP', emoji: '👸', sold: 23 },
    ],
    redeemItems: [
      { id: 101, name: '猫爪造型发卡', desc: '宠物联名款 · 限量', points: 500, tag: '精选', emoji: '🐾', stock: 50 },
      { id: 102, name: '品牌定制徽章', desc: '第五季限定徽章', points: 800, tag: '限量', emoji: '🎀', stock: 30 },
      { id: 103, name: '护手霜礼盒套装', desc: '天然植物萃取', points: 1200, tag: '推荐', emoji: '🌸', stock: 20 },
      { id: 104, name: '第五季帆布袋', desc: '环保材质 · 联名设计', points: 600, tag: '新品', emoji: '🌿', stock: 40 },
      { id: 105, name: '美甲贴纸套装', desc: '原创设计 · 20 张装', points: 300, tag: '好评', emoji: '💅', stock: 100 },
      { id: 106, name: '会员折扣券（9折）', desc: '下次消费可用', points: 400, tag: '实用', emoji: '🎫', stock: 999 },
    ],
  },

  onShow() {
    this.setData({ userPoints: app.globalData.userInfo.points });
  },

  switchTab(e) {
    this.setData({ activeTab: parseInt(e.currentTarget.dataset.index) });
  },

  buyPackage(e) {
    const item = e.currentTarget.dataset.item;
    wx.showModal({
      title: `购买 ${item.name}`,
      content: `价格：¥${item.price}\n\n是否确认购买？购买后技师将与您联系确认预约时间。`,
      confirmText: '确认购买',
      confirmColor: '#C8847A',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: '购买成功！', icon: 'success' });
        }
      },
    });
  },

  redeemItem(e) {
    const item = e.currentTarget.dataset.item;
    const userPoints = app.globalData.userInfo.points;
    if (userPoints < item.points) {
      wx.showModal({
        title: '积分不足',
        content: `兑换需要 ${item.points} 积分，您当前有 ${userPoints} 积分，还差 ${item.points - userPoints} 积分。`,
        showCancel: false,
        confirmText: '去赚积分',
      });
      return;
    }
    wx.showModal({
      title: `兑换 ${item.name}`,
      content: `需消耗 ${item.points} 积分\n当前积分：${userPoints}\n兑换后剩余：${userPoints - item.points}`,
      confirmText: '确认兑换',
      confirmColor: '#C9A76B',
      success: (res) => {
        if (res.confirm) {
          const newPoints = userPoints - item.points;
          app.saveUserInfo({ points: newPoints });
          this.setData({ userPoints: newPoints });
          wx.showToast({ title: '兑换成功！', icon: 'success' });
        }
      },
    });
  },
});
