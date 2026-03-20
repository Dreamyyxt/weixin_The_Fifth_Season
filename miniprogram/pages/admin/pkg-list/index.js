const { statusBarHeight } = wx.getWindowInfo();
const NAV_TOP = statusBarHeight + 12;

Page({
  data: {
    navTopPadding: NAV_TOP,
    activeTab: 'package',
    packages: [],
    redeemItems: [],
    loading: true,
  },

  onShow() {
    this.loadProducts();
  },

  async loadProducts() {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('products').get();
      this.setData({
        packages:    res.data.filter(p => p.type === 'package'),
        redeemItems: res.data.filter(p => p.type === 'redeem'),
      });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/admin/pkg-edit/index?id=${id}` });
  },

  goAdd() {
    const type = this.data.activeTab;
    wx.navigateTo({ url: `/pages/admin/pkg-edit/index?type=${type}` });
  },

  deletePkg(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除套餐',
      content: '删除后无法恢复，确认吗？',
      confirmColor: '#C0392B',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...' });
        try {
          const result = await wx.cloud.callFunction({
            name: 'adminManagePkg',
            data: { action: 'delete', pkg: { _id: id } },
          });
          wx.hideLoading();
          if (result.result.success) {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadProducts();
          }
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },

  goBack() { wx.navigateBack(); },
});
