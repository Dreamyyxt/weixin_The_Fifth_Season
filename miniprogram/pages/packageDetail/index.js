const app = getApp();

Page({
  data: {
    pkg: null,
    technicians: [],
    selectedTechId: '',
    loading: true,
  },

  onLoad(options) {
    this.pkgId = options.id;
    this.loadDetail();
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const [pkgRes, techRes] = await Promise.all([
        db.collection('products').doc(this.pkgId).get(),
        db.collection('technicians').orderBy('order', 'asc').get(),
      ]);

      const pkg = pkgRes.data;
      // 只显示该套餐绑定的技师
      const techIds = pkg.techIds || [];
      const technicians = techRes.data
        .filter(t => techIds.includes(t._id))
        .map(t => ({ ...t, avatarIsImg: !!(t.avatar && t.avatar.length > 10) }));

      this.setData({ pkg, technicians });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      console.error('loadDetail:', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  selectTech(e) {
    this.setData({ selectedTechId: e.currentTarget.dataset.id });
  },

  goBooking() {
    const { pkg, selectedTechId } = this.data;
    if (!selectedTechId) {
      wx.showToast({ title: '请先选择技师', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/booking/index?techId=${selectedTechId}&serviceId=${pkg.serviceId}&pkgId=${pkg._id}`,
    });
  },
});
