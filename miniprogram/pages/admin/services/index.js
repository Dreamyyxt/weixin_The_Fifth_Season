Page({
  data: {
    categories: [],
    services: [],
    loading: true,

    // 编辑分类弹窗
    showCatModal: false,
    editingCat: null,       // null = new
    catNameInput: '',
    catOrderInput: '',

    // 编辑服务弹窗
    showSvcSheet: false,
    editingSvc: null,       // null = new
    svcCategoryId: '',
    svcForm: { name: '', price: '', durationMin: '', subgroup: '', isQuote: false, order: '' },
  },

  onLoad() { this.loadData(); },
  onShow()  { this.loadData(); },

  async loadData() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'getServices' });
      if (res.result.success) {
        this.setData({ categories: res.result.categories, services: res.result.services });
      }
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // ── 分类管理 ─────────────────────────────────────────────────
  openAddCat() {
    this.setData({ showCatModal: true, editingCat: null, catNameInput: '', catOrderInput: '' });
  },

  openEditCat(e) {
    const cat = e.currentTarget.dataset.cat;
    this.setData({
      showCatModal: true,
      editingCat: cat,
      catNameInput: cat.name,
      catOrderInput: String(cat.order),
    });
  },

  closeCatModal() { this.setData({ showCatModal: false }); },

  onCatNameInput(e)  { this.setData({ catNameInput:  e.detail.value }); },
  onCatOrderInput(e) { this.setData({ catOrderInput: e.detail.value }); },

  async saveCat() {
    const { catNameInput, catOrderInput, editingCat } = this.data;
    if (!catNameInput.trim()) return wx.showToast({ title: '请填写分类名称', icon: 'none' });
    wx.showLoading({ title: '保存中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'adminManageService',
        data: {
          action: 'save',
          target: 'category',
          id: editingCat ? editingCat._id : undefined,
          data: { name: catNameInput.trim(), order: Number(catOrderInput) || 99 },
        },
      });
      wx.hideLoading();
      if (res.result.success) {
        wx.showToast({ title: '已保存', icon: 'success' });
        this.setData({ showCatModal: false });
        this.loadData();
      } else {
        wx.showToast({ title: res.result.error || '保存失败', icon: 'none' });
      }
    } catch (_) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  deleteCat(e) {
    const cat = e.currentTarget.dataset.cat;
    wx.showModal({
      title: '删除分类',
      content: `确定删除「${cat.name}」？该分类下的服务项目不会自动删除。`,
      confirmText: '确定删除',
      confirmColor: '#E74C3C',
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '删除中...' });
        await wx.cloud.callFunction({ name: 'adminManageService', data: { action: 'delete', target: 'category', id: cat._id } });
        wx.hideLoading();
        this.loadData();
      },
    });
  },

  // ── 服务管理 ─────────────────────────────────────────────────
  openAddSvc(e) {
    const categoryId = e.currentTarget.dataset.catid;
    this.setData({
      showSvcSheet: true,
      editingSvc: null,
      svcCategoryId: categoryId,
      svcForm: { name: '', price: '', durationMin: '', subgroup: '', isQuote: false, order: '' },
    });
  },

  openEditSvc(e) {
    const svc = e.currentTarget.dataset.svc;
    this.setData({
      showSvcSheet: true,
      editingSvc: svc,
      svcCategoryId: svc.categoryId,
      svcForm: {
        name:        svc.name,
        price:       String(svc.price),
        durationMin: String(svc.durationMin),
        subgroup:    svc.subgroup || '',
        isQuote:     svc.isQuote || false,
        order:       String(svc.order),
      },
    });
  },

  closeSvcSheet() { this.setData({ showSvcSheet: false }); },

  onSvcInput(e)        { this.setData({ [`svcForm.${e.currentTarget.dataset.field}`]: e.detail.value }); },
  onSvcIsQuoteChange() { this.setData({ 'svcForm.isQuote': !this.data.svcForm.isQuote }); },

  async saveSvc() {
    const { svcForm, svcCategoryId, editingSvc } = this.data;
    if (!svcForm.name.trim())  return wx.showToast({ title: '请填写项目名称', icon: 'none' });
    if (!svcForm.price)        return wx.showToast({ title: '请填写价格', icon: 'none' });
    if (!svcForm.durationMin)  return wx.showToast({ title: '请填写时长（分钟）', icon: 'none' });
    wx.showLoading({ title: '保存中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'adminManageService',
        data: {
          action: 'save',
          target: 'service',
          id: editingSvc ? editingSvc._id : undefined,
          data: {
            categoryId:  svcCategoryId,
            name:        svcForm.name.trim(),
            price:       Number(svcForm.price),
            durationMin: Number(svcForm.durationMin),
            subgroup:    svcForm.subgroup.trim(),
            isQuote:     svcForm.isQuote,
            order:       Number(svcForm.order) || 99,
          },
        },
      });
      wx.hideLoading();
      if (res.result.success) {
        wx.showToast({ title: '已保存', icon: 'success' });
        this.setData({ showSvcSheet: false });
        this.loadData();
      } else {
        wx.showToast({ title: res.result.error || '保存失败', icon: 'none' });
      }
    } catch (_) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  deleteSvc(e) {
    const svc = e.currentTarget.dataset.svc;
    wx.showModal({
      title: '删除服务项目',
      content: `确定删除「${svc.name}」？`,
      confirmText: '确定删除',
      confirmColor: '#E74C3C',
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '删除中...' });
        await wx.cloud.callFunction({ name: 'adminManageService', data: { action: 'delete', target: 'service', id: svc._id } });
        wx.hideLoading();
        this.loadData();
      },
    });
  },

  // 根据 categoryId 返回该分类下的服务列表
  servicesOf(categoryId) {
    return this.data.services.filter(s => s.categoryId === categoryId);
  },
});
